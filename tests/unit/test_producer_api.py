"""
Producer API request handling.

The broker is stubbed out: these cover validation, error mapping and the payload
actually sent, none of which had any coverage before.
"""
from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from producer_api.main import app
from producer_api.routes import order_routes


@pytest.fixture
def channel():
    return MagicMock()


@pytest.fixture
def client(channel, monkeypatch):
    """Swaps the shared broker channel for a mock, so no RabbitMQ is needed."""

    @contextmanager
    def fake_channel():
        yield channel

    monkeypatch.setattr(order_routes, "publishing_channel", fake_channel)
    # Skip the startup broker connection.
    monkeypatch.setattr("producer_api.broker.connect", lambda: None)
    monkeypatch.setattr("producer_api.broker.close", lambda: None)
    monkeypatch.setattr("producer_api.broker.is_connected", lambda: True)
    with TestClient(app) as test_client:
        yield test_client


class TestHealth:
    def test_reports_ok(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["service"] == "producer_api"


class TestPublish:
    def test_publishes_an_order(self, client, channel):
        response = client.post("/orders/publish", json={"region": "EU", "format": "json"})
        assert response.status_code == 200
        assert response.json()["order_id"]

        exchanges = [c.kwargs["exchange"] for c in channel.basic_publish.call_args_list]
        # Default (work queues), fanout, direct log, topic and headers.
        assert "" in exchanges
        assert "order.events" in exchanges
        assert "notifications.topic" in exchanges
        assert "orders.headers" in exchanges

    def test_payment_is_queued_before_inventory(self, client, channel):
        """FR-01 ordering: inventory is only reserved after payment is queued."""
        client.post("/orders/publish", json={})
        keys = [
            c.kwargs["routing_key"]
            for c in channel.basic_publish.call_args_list
            if c.kwargs["exchange"] == ""
        ]
        assert keys.index("payment_queue") < keys.index("inventory_queue")

    def test_headers_carry_region_and_format(self, client, channel):
        client.post("/orders/publish", json={"region": "EU", "format": "xml"})
        headers_call = next(
            c for c in channel.basic_publish.call_args_list
            if c.kwargs["exchange"] == "orders.headers"
        )
        assert headers_call.kwargs["properties"].headers == {"region": "EU", "format": "xml"}

    def test_custom_customer_and_items_are_sent(self, client, channel):
        """These are validated by the dashboard form and must reach the broker."""
        import json

        response = client.post("/orders/publish", json={
            "customer_name": "Ada Lovelace",
            "items": [{"sku": "SKU-9", "name": "Analytical Engine", "qty": 2, "price": 10.0}],
        })
        assert response.status_code == 200

        first = channel.basic_publish.call_args_list[0]
        payload = json.loads(first.kwargs["body"])
        assert payload["customer_name"] == "Ada Lovelace"
        assert payload["items"][0]["sku"] == "SKU-9"

    @pytest.mark.parametrize("payload", [
        {"region": "ASIA"},          # no headers binding exists for this
        {"format": "yaml"},          # ditto
        {"amount": -5},              # payment_consumer would reject it
        {"amount": 0},
        {"currency": "US"},          # must be a 3-letter code
    ])
    def test_invalid_input_is_rejected(self, client, payload):
        assert client.post("/orders/publish", json=payload).status_code == 422

    def test_broker_failure_maps_to_503(self, client, channel):
        channel.basic_publish.side_effect = RuntimeError("broker down")
        response = client.post("/orders/publish", json={})
        assert response.status_code == 503


class TestBatch:
    def test_publishes_the_requested_count(self, client):
        response = client.post("/orders/batch", json={"count": 5})
        assert response.status_code == 200
        assert response.json()["count"] == 5
        assert len(response.json()["order_ids"]) == 5

    def test_batch_honours_amount_and_currency(self, client, channel):
        """These used to be ignored, so every batch order was $99.99 USD."""
        import json

        client.post("/orders/batch", json={"count": 2, "amount": 12.5, "currency": "EUR"})
        payload = json.loads(channel.basic_publish.call_args_list[0].kwargs["body"])
        assert payload["amount"] == 12.5
        assert payload["currency"] == "EUR"

    def test_count_is_bounded(self, client):
        """Unbounded counts were a trivial way to wedge the service."""
        assert client.post("/orders/batch", json={"count": 1_000_000}).status_code == 422
        assert client.post("/orders/batch", json={"count": 0}).status_code == 422

    def test_partial_failure_reports_how_far_it_got(self, client, channel):
        channel.basic_publish.side_effect = [None] * 8 + [RuntimeError("broker down")]
        response = client.post("/orders/batch", json={"count": 5})
        assert response.status_code == 503
        assert "before failing" in response.json()["detail"]


class TestFlood:
    def test_floods_a_known_exchange(self, client, channel):
        response = client.post("/orders/flood/order.events", json={"count": 10})
        assert response.status_code == 200
        assert channel.basic_publish.call_count == 10

    def test_unknown_exchange_is_rejected(self, client):
        assert client.post("/orders/flood/nope", json={"count": 1}).status_code == 422

    def test_each_message_gets_its_own_id_and_timestamp(self, client, channel):
        """Reusing one properties object made every flooded message identical."""
        client.post("/orders/flood/order.events", json={"count": 5})
        ids = {c.kwargs["properties"].message_id for c in channel.basic_publish.call_args_list}
        assert len(ids) == 5

    def test_count_is_bounded(self, client):
        assert client.post("/orders/flood/order.events", json={"count": 99_999}).status_code == 422


class TestCorrelationId:
    """Every publish for one order carries that order's id, so a single order
    can be followed across all five exchanges and every queue it fans out to."""

    def test_every_publish_shares_one_correlation_id(self, client, channel):
        response = client.post("/orders/publish", json={})
        order_id = response.json()["order_id"]

        ids = {c.kwargs["properties"].correlation_id
               for c in channel.basic_publish.call_args_list}
        assert ids == {order_id}

    def test_correlation_id_spans_all_five_exchange_types(self, client, channel):
        response = client.post("/orders/publish", json={"region": "EU"})
        order_id = response.json()["order_id"]

        by_exchange = {}
        for call in channel.basic_publish.call_args_list:
            by_exchange[call.kwargs["exchange"]] = call.kwargs["properties"].correlation_id

        for exchange in ("", "order.events", "logs.info",
                         "notifications.topic", "orders.headers"):
            assert by_exchange.get(exchange) == order_id, f"{exchange} lost the trace"

    def test_each_order_in_a_batch_gets_its_own(self, client, channel):
        response = client.post("/orders/batch", json={"count": 3})
        expected = set(response.json()["order_ids"])

        ids = {c.kwargs["properties"].correlation_id
               for c in channel.basic_publish.call_args_list}
        assert ids == expected
