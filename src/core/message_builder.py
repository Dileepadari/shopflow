"""
src.core.message_builder
~~~~~~~~~~~~~~~~~~~~~~~~~
Helpers for building persistent pika.BasicProperties and standard order payloads.
"""
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pika

DEFAULT_CUSTOMER_NAME = "Test Customer"


def build_properties(content_type: str = "application/json",
                     headers: dict | None = None,
                     correlation_id: str | None = None,
                     app_id: str = "shopflow") -> pika.BasicProperties:
    """Persistent message properties (FR-06).

    ``correlation_id`` carries the order id so one order can be traced across
    all five exchanges and every queue it fans out to.
    """
    return pika.BasicProperties(
        delivery_mode=pika.DeliveryMode.Persistent,
        content_type=content_type,
        content_encoding="utf-8",
        message_id=str(uuid.uuid4()),
        correlation_id=correlation_id,
        app_id=app_id,
        timestamp=int(datetime.now(UTC).timestamp()),
        headers=headers or {},
    )


def build_order_payload(order_id: str | None = None,
                        customer_name: str | None = None,
                        customer_email: str = "test@shopflow.io",
                        customer_phone: str = "+1-555-0100",
                        amount: float = 99.99,
                        currency: str = "USD",
                        region: str = "US",
                        fmt: str = "json",
                        items: list | None = None) -> dict[str, Any]:
    return {
        "order_id": order_id or str(uuid.uuid4()),
        "customer_name": customer_name or DEFAULT_CUSTOMER_NAME,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "amount": amount,
        "currency": currency,
        "region": region,
        "format": fmt,
        "items": items or [{"sku": "ITEM-001", "name": "Sample Product",
                            "qty": 1, "price": amount}],
        "timestamp": datetime.now(UTC).isoformat(),
    }


def encode(payload: dict) -> bytes:
    return json.dumps(payload, default=str).encode("utf-8")


def decode(body: bytes) -> dict:
    """Decode a message body. Raises on malformed JSON - callers dead-letter it."""
    return json.loads(body.decode("utf-8"))
