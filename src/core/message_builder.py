"""
src.core.message_builder
~~~~~~~~~~~~~~~~~~~~~~~~~
Helpers for building persistent pika.BasicProperties and standard order payloads.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Any
import pika

def build_properties(content_type: str = "application/json",
                     headers: dict | None = None) -> pika.BasicProperties:
    return pika.BasicProperties(
        delivery_mode=pika.DeliveryMode.Persistent,
        content_type=content_type,
        message_id=str(uuid.uuid4()),
        timestamp=int(datetime.now(timezone.utc).timestamp()),
        headers=headers or {},
    )

def build_order_payload(order_id=None, customer_name="Test Customer",
                        customer_email="test@shopflow.io",
                        customer_phone="+1-555-0100", amount=99.99,
                        currency="USD", region="US", fmt="json",
                        items=None) -> dict[str, Any]:
    return {
        "order_id": order_id or str(uuid.uuid4()),
        "customer_name": customer_name,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "amount": amount,
        "currency": currency,
        "region": region,
        "format": fmt,
        "items": items or [{"sku": "ITEM-001", "name": "Sample Product",
                            "qty": 1, "price": amount}],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

def encode(payload: dict) -> bytes:
    return json.dumps(payload, default=str).encode("utf-8")

def decode(body: bytes) -> dict:
    return json.loads(body.decode("utf-8"))
