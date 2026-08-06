"""Unit tests for src.core.message_builder."""
import json
from datetime import datetime

import pika
import pytest

from src.core.message_builder import (
    DEFAULT_CUSTOMER_NAME,
    build_order_payload,
    build_properties,
    decode,
    encode,
)


class TestOrderPayload:
    def test_carries_the_supplied_fields(self):
        order = build_order_payload(
            customer_name="cust_123", amount=99.99, region="US", fmt="json"
        )
        assert order["customer_name"] == "cust_123"
        assert order["amount"] == 99.99
        assert order["region"] == "US"
        assert order["format"] == "json"
        assert order["order_id"]

    def test_customer_name_falls_back_to_the_default(self):
        assert build_order_payload()["customer_name"] == DEFAULT_CUSTOMER_NAME
        assert build_order_payload(customer_name=None)["customer_name"] == DEFAULT_CUSTOMER_NAME

    def test_items_are_preserved(self):
        items = [
            {"sku": "prod_1", "qty": 2, "price": 50.00},
            {"sku": "prod_2", "qty": 1, "price": 49.99},
        ]
        assert build_order_payload(items=items)["items"] == items

    def test_default_item_mirrors_the_order_amount(self):
        order = build_order_payload(amount=42.5)
        assert order["items"][0]["price"] == 42.5

    def test_order_ids_are_unique(self):
        ids = {build_order_payload()["order_id"] for _ in range(50)}
        assert len(ids) == 50

    def test_timestamp_is_iso_8601(self):
        order = build_order_payload()
        assert datetime.fromisoformat(order["timestamp"]) is not None

    def test_explicit_order_id_is_respected(self):
        assert build_order_payload(order_id="ORD-1")["order_id"] == "ORD-1"


class TestProperties:
    def test_messages_are_persistent(self):
        """FR-06: every message must survive a broker restart.

        pika stores this as the plain int 2, not the DeliveryMode enum member.
        """
        assert build_properties().delivery_mode == pika.DeliveryMode.Persistent.value

    def test_defaults(self):
        props = build_properties()
        assert props.content_type == "application/json"
        assert props.content_encoding == "utf-8"
        assert props.app_id == "shopflow"
        assert isinstance(props.headers, dict)
        assert props.timestamp > 0

    def test_message_ids_are_unique(self):
        assert build_properties().message_id != build_properties().message_id

    def test_headers_are_passed_through(self):
        props = build_properties(headers={"region": "EU", "format": "json"})
        assert props.headers == {"region": "EU", "format": "json"}

    def test_correlation_id_enables_tracing(self):
        assert build_properties(correlation_id="ORD-7").correlation_id == "ORD-7"


class TestSerialization:
    def test_roundtrip(self):
        payload = {"type": "email", "recipient": "user@example.com"}
        assert decode(encode(payload)) == payload

    def test_encodes_utf8(self):
        assert decode(encode({"name": "Ünicode ☕"}))["name"] == "Ünicode ☕"

    def test_non_json_types_are_stringified(self):
        """default=str keeps encode from raising on datetimes and similar."""
        now = datetime.now()
        assert decode(encode({"at": now}))["at"] == str(now)

    def test_order_payload_is_json_serializable(self):
        order = build_order_payload(customer_name="cust_1")
        assert json.loads(json.dumps(order))["customer_name"] == "cust_1"

    def test_decode_raises_on_malformed_json(self):
        """Callers rely on this to dead-letter poison messages."""
        with pytest.raises(json.JSONDecodeError):
            decode(b"__POISON__INVALID_JSON__")
