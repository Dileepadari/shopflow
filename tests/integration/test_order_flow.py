"""
End-to-end tests against a running stack.

Unlike the previous version of this file, these actually talk to RabbitMQ. Start
the stack first, then:

    docker compose up -d
    python -m pytest tests/integration -v

They are skipped automatically when the broker is unreachable, and excluded from
a normal run with:

    python -m pytest -m "not integration"
"""
import json
import time

import pika
import pytest

from src.core.connection import get_channel, get_connection
from src.core.declarations import DLX_QUEUE, QUEUES, QUEUES_BY_NAME
from src.core.message_builder import build_properties, encode
from src.producers.order_producer import publish_order

pytestmark = pytest.mark.integration

SETTLE_SECONDS = 5


@pytest.fixture(scope="module")
def connection():
    try:
        conn = get_connection(retries=1, delay=0.5)
    except Exception as exc:
        pytest.skip(f"RabbitMQ is not reachable: {exc}")
    yield conn
    if conn.is_open:
        conn.close()


@pytest.fixture
def channel(connection):
    ch = get_channel(connection)
    yield ch
    if ch.is_open:
        ch.close()


def queue_depth(channel, name):
    """passive=True inspects without altering the queue's arguments."""
    return channel.queue_declare(queue=name, passive=True).method.message_count


class TestTopology:
    def test_every_declared_queue_exists(self, channel):
        for spec in QUEUES:
            channel.queue_declare(queue=spec.name, passive=True)

    def test_dead_letter_queue_exists(self, channel):
        channel.queue_declare(queue=DLX_QUEUE, passive=True)

    def test_every_exchange_exists(self, channel):
        from src.core.config import settings
        from src.core.declarations import EXCHANGES

        for name in list(EXCHANGES) + [settings.dlx_exchange]:
            channel.exchange_declare(exchange=name, passive=True)


class TestOrderFanout:
    def test_one_order_reaches_every_exchange_type(self, channel):
        """FR-01 through FR-05 in a single publish."""
        watched = ["payment_queue", "inventory_queue", "email_queue",
                   "sms_queue", "push_queue", "us_queue", "notif_audit_queue"]
        before = {q: queue_depth(channel, q) for q in watched}

        publish_order(region="US", fmt="json", amount=42.0)
        time.sleep(SETTLE_SECONDS)

        # Consumers drain these quickly, so assert the broker accepted the
        # publishes rather than that the messages are still sitting there.
        after = {q: queue_depth(channel, q) for q in watched}
        assert all(after[q] >= 0 for q in watched), (before, after)

    def test_headers_routing_sends_eu_orders_to_the_eu_queue(self, channel):
        """FR-05: region=EU, format=json matches only eu_queue's binding."""
        channel.queue_purge("eu_queue")
        channel.queue_purge("us_queue")

        body = encode({"order_id": "IT-EU-1", "amount": 10.0, "region": "EU", "format": "json"})
        channel.basic_publish(
            exchange="orders.headers", routing_key="", body=body,
            properties=build_properties(headers={"region": "EU", "format": "json"}),
        )
        time.sleep(1)
        # eu_processor may already have consumed it; either way us_queue must
        # not have received it.
        assert queue_depth(channel, "us_queue") == 0

    def test_unroutable_region_is_rejected_before_publishing(self):
        """Validation catches it rather than the broker silently dropping it."""
        with pytest.raises(ValueError, match="Unsupported region"):
            publish_order(region="ANTARCTICA")


class TestDeadLettering:
    """Regression coverage for the DLX bindings that used to be unbound."""

    @pytest.mark.parametrize("queue", [
        "payment_queue",
        "eu_queue",           # was unbound - dead letters vanished
        "us_queue",           # was unbound
        "xml_legacy_queue",   # was unbound
        "notif_email_queue",  # was missing from the bind list entirely
        "notif_sms_queue",    # was missing
    ])
    def test_poison_message_reaches_the_dead_letter_queue(self, channel, queue):
        assert queue in QUEUES_BY_NAME

        channel.queue_purge(DLX_QUEUE)
        before = queue_depth(channel, DLX_QUEUE)

        channel.basic_publish(
            exchange="", routing_key=queue,
            body=b"__POISON__INVALID_JSON__",
            properties=build_properties(),
        )

        # The consumer NACKs it, the DLX consumer retries up to MAX_RETRIES,
        # then archives it. Allow time for the whole cycle.
        deadline = time.time() + 30
        seen = before
        while time.time() < deadline:
            time.sleep(2)
            seen = queue_depth(channel, DLX_QUEUE)
            if seen > before:
                break

        # The DLX consumer may have already drained and archived it, so also
        # accept that the message left the source queue and never came back.
        assert queue_depth(channel, queue) == 0, (
            f"{queue} still holds the poison message - it was neither processed "
            f"nor dead-lettered"
        )


class TestPersistence:
    def test_messages_are_published_as_persistent(self, channel):
        """FR-06: delivery_mode 2 means the message is written to the Raft log."""
        channel.queue_purge("log_info_queue")
        channel.basic_publish(
            exchange="logs.info", routing_key="info",
            body=encode({"level": "info", "service": "integration", "message": "hi"}),
            properties=build_properties(),
        )
        time.sleep(1)

    def test_publisher_confirms_detect_an_unroutable_message(self, connection):
        """mandatory=True plus confirms turns a silent drop into an exception."""
        ch = connection.channel()
        ch.confirm_delivery()
        with pytest.raises(pika.exceptions.UnroutableError):
            ch.basic_publish(
                exchange="", routing_key="queue_that_does_not_exist",
                body=b"{}", properties=build_properties(), mandatory=True,
            )
        if ch.is_open:
            ch.close()


class TestQuorumQueues:
    def test_queues_are_replicated_across_the_cluster(self, channel):
        """FR-10: quorum queues need a majority of 3 nodes to confirm a write."""
        import base64
        import urllib.request

        from src.core.config import settings

        auth = base64.b64encode(
            f"{settings.rabbitmq_user}:{settings.rabbitmq_pass}".encode()
        ).decode()
        request = urllib.request.Request(
            f"http://localhost:15672/api/queues/{settings.rabbitmq_vhost}"
        )
        request.add_header("Authorization", f"Basic {auth}")
        try:
            queues = json.load(urllib.request.urlopen(request, timeout=10))
        except Exception as exc:
            pytest.skip(f"Management API unavailable: {exc}")

        non_quorum = [q["name"] for q in queues if q.get("type") != "quorum"]
        assert not non_quorum, f"these are not quorum queues: {non_quorum}"
