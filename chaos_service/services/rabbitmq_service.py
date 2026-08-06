"""
Queue-level chaos operations.

Uses the shared src.core.management client for HTTP calls and src.core.connection
for AMQP, rather than reimplementing either. Errors propagate as
ManagementError/ChaosError so the routes can return a real HTTP status - the
previous version swallowed every exception and returned 200 with a message
saying it had succeeded.
"""
import json
import uuid
from datetime import UTC, datetime

from src.core import management
from src.core.connection import REQUEST_RETRIES, get_connection
from src.core.declarations import QUEUES_BY_NAME
from src.core.message_builder import build_properties
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

POISON_BODY = b"__POISON__INVALID_JSON__"


class ChaosError(RuntimeError):
    """A chaos action could not be carried out."""


def _publish_target(queue_name: str) -> tuple[str, str, dict | None]:
    """Where to publish so a message lands in ``queue_name``.

    Derived from the topology registry rather than a second hand-maintained map,
    which had drifted: every headers queue pointed at the same exchange with no
    headers, so flooding eu_queue actually split messages between eu_queue and
    us_queue and could never reach xml_legacy_queue at all.
    """
    spec = QUEUES_BY_NAME.get(queue_name)
    if spec is None:
        raise ChaosError(
            f"Unknown queue {queue_name!r}. Expected one of {sorted(QUEUES_BY_NAME)}."
        )
    if spec.exchange is None:
        # Default exchange: routing key is the queue name.
        return "", spec.name, None
    routing_key = spec.routing_keys[0] if spec.routing_keys else ""
    if spec.bind_arguments:
        # Headers exchange: reproduce the binding's match criteria, minus x-match.
        headers = {k: v for k, v in spec.bind_arguments.items() if k != "x-match"}
        return spec.exchange, "", headers
    if routing_key == "#":
        # A binding pattern, not a publishable routing key.
        routing_key = "notification.chaos.flood"
    return spec.exchange, routing_key, None


class RabbitMQService:
    def _connection(self):
        return get_connection(retries=REQUEST_RETRIES, delay=2.0)

    def purge_queue(self, queue: str) -> str:
        if queue not in QUEUES_BY_NAME and queue != "dead_letter_queue":
            raise ChaosError(f"Unknown queue {queue!r}.")
        management.purge_queue(queue)
        return f"Queue {queue} purged"

    def inject_poison_messages(self, queue: str, count: int) -> str:
        """Publish undecodable bodies straight to a queue.

        Each one fails in the consumer, is NACKed with requeue=False, and lands
        on the dead letter exchange - which is the point of the demonstration.
        """
        if queue not in QUEUES_BY_NAME:
            raise ChaosError(f"Unknown queue {queue!r}.")
        connection = self._connection()
        try:
            channel = connection.channel()
            for index in range(count):
                # Tagged so the resulting dead letter records can be traced back
                # to this injection - the body is deliberately undecodable, so
                # there is no order id inside it to fall back on.
                correlation_id = f"POISON-{uuid.uuid4().hex[:8]}-{index}"
                channel.basic_publish(
                    exchange="", routing_key=queue, body=POISON_BODY,
                    properties=build_properties(correlation_id=correlation_id),
                )
        except Exception as exc:
            raise ChaosError(f"Could not inject poison messages: {exc}") from exc
        finally:
            self._close(connection)
        return f"Injected {count} poison messages into {queue}"

    def flood_queue(self, queue: str, count: int) -> str:
        """Flood the exchange that feeds ``queue`` with realistic messages."""
        exchange, routing_key, headers = _publish_target(queue)
        connection = self._connection()
        try:
            channel = connection.channel()
            for index in range(count):
                payload = self._flood_payload(queue, index)
                channel.basic_publish(
                    exchange=exchange, routing_key=routing_key,
                    body=json.dumps(payload).encode(),
                    properties=build_properties(headers=headers,
                                                correlation_id=payload["order_id"]),
                )
        except Exception as exc:
            raise ChaosError(f"Could not flood {queue}: {exc}") from exc
        finally:
            self._close(connection)
        target = f"exchange {exchange!r}" if exchange else "the default exchange"
        return f"Flooded {queue} with {count} messages via {target}"

    @staticmethod
    def _flood_payload(queue: str, index: int) -> dict:
        """A body shaped like whatever the target consumer expects."""
        payload = {
            "order_id": f"FLOOD-{uuid.uuid4().hex[:8]}",
            "flood": True,
            "batch_index": index,
            "timestamp": datetime.now(UTC).isoformat(),
            "customer_name": f"Flood Customer {index}",
            "customer_email": f"customer{index}@example.com",
            "customer_phone": "+1-555-0100",
            # payment_consumer rejects amounts <= 0, so keep this positive.
            "amount": 99.99,
            "currency": "USD",
            "items": [{"sku": "SKU-001", "name": "Flood Item", "qty": 1, "price": 99.99}],
        }
        spec = QUEUES_BY_NAME.get(queue)
        if spec is not None and spec.bind_arguments:
            payload["region"] = spec.bind_arguments.get("region", "US")
            payload["format"] = spec.bind_arguments.get("format", "json")
        if queue in ("log_error_queue", "log_info_queue"):
            payload["level"] = "error" if queue == "log_error_queue" else "info"
            payload["service"] = "chaos_flood"
            payload["message"] = f"Flood {payload['level']} message {index}"
        return payload

    def drop_all_connections(self) -> str:
        connections = management.connections() or []
        dropped, failed = 0, 0
        for conn in connections:
            name = conn.get("name", "")
            if not name:
                continue
            try:
                management.close_connection(name)
                dropped += 1
            except management.ManagementError as exc:
                failed += 1
                logger.warning("Could not drop connection %s: %s", name, exc)
        if failed:
            return f"Dropped {dropped} connections, {failed} failed"
        return f"Dropped {dropped} connections"

    def get_cluster_status(self) -> list[dict]:
        try:
            nodes = management.nodes() or []
        except management.ManagementError as exc:
            logger.warning("Cluster status unavailable: %s", exc)
            return []
        return [{"name": n.get("name"), "running": n.get("running"),
                 "mem_used": n.get("mem_used"), "disk_free": n.get("disk_free")}
                for n in nodes]

    def get_active_consumer_tags(self) -> set[str]:
        try:
            consumers = management.consumers() or []
        except management.ManagementError as exc:
            logger.warning("Consumer list unavailable: %s", exc)
            return set()
        return {c["consumer_tag"] for c in consumers if c.get("consumer_tag")}

    @staticmethod
    def _close(connection) -> None:
        try:
            if connection.is_open:
                connection.close()
        except Exception as exc:
            logger.debug("Error closing chaos connection: %s", exc)
