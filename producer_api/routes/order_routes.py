"""
producer_api.routes.order_routes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
REST endpoints for publishing orders and flooding queues.
"""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import pika

from src.producers.order_producer import publish_order
from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import build_properties, build_order_payload, encode

router = APIRouter(prefix="/orders", tags=["Orders"])


class OrderRequest(BaseModel):
    region:   Optional[str]   = "US"
    format:   Optional[str]   = "json"
    amount:   Optional[float] = 99.99
    currency: Optional[str]   = "USD"


class BatchRequest(BaseModel):
    count:    int             = 10
    region:   Optional[str]  = "US"
    format:   Optional[str]  = "json"


class FloodRequest(BaseModel):
    exchange:    str
    count:       int          = 50
    routing_key: Optional[str] = ""


@router.post("/publish")
def publish_single(req: OrderRequest):
    """Publish one order through all 5 exchange types."""
    try:
        payload = publish_order(
            region=req.region, fmt=req.format,
            amount=req.amount, currency=req.currency,
        )
        return {"status": "published", "order_id": payload["order_id"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch")
def publish_batch(req: BatchRequest):
    """Publish N orders."""
    order_ids = []
    for _ in range(req.count):
        payload = publish_order(region=req.region, fmt=req.format)
        order_ids.append(payload["order_id"])
    return {"status": "published", "count": req.count, "order_ids": order_ids}


@router.post("/flood/{exchange}")
def flood_exchange(exchange: str, req: FloodRequest):
    """Flood an exchange with N messages (load test helper)."""
    try:
        conn = get_connection()
        ch   = get_channel(conn)
        declare_all(ch)
        props = build_properties()
        for _ in range(req.count):
            body = encode(build_order_payload())
            ch.basic_publish(exchange=exchange,
                             routing_key=req.routing_key or "",
                             body=body, properties=props)
        conn.close()
        return {"status": "flooded", "exchange": exchange, "count": req.count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
