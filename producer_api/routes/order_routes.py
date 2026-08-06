"""
producer_api.routes.order_routes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
REST endpoints for publishing orders and flooding exchanges.
"""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from producer_api.broker import publishing_channel
from src.core.declarations import EXCHANGES
from src.core.message_builder import build_order_payload, build_properties, encode
from src.producers.order_producer import publish_order
from src.utils.logger import setup_logging

logger = setup_logging(__name__)
router = APIRouter(prefix="/orders", tags=["Orders"])

#: Upper bound on a single request. Without one, {"count": 1000000} is a trivial
#: way to wedge the service.
MAX_BATCH = 1000
MAX_FLOOD = 5000

#: Only exchanges this system actually declares may be flooded. Publishing to an
#: undeclared exchange closes the channel mid-loop with a 404.
FLOODABLE_EXCHANGES = frozenset(EXCHANGES) | {""}

Region = Literal["US", "EU"]
OrderFormat = Literal["json", "xml"]


class OrderItem(BaseModel):
    sku: str = "ITEM-001"
    name: str = "Sample Product"
    qty: int = Field(default=1, ge=1)
    price: float = Field(default=99.99, ge=0)


class OrderRequest(BaseModel):
    region: Region = "US"
    format: OrderFormat = "json"
    amount: float = Field(default=99.99, gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    customer_name: str | None = None
    items: list[OrderItem] | None = None


class BatchRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=MAX_BATCH)
    region: Region = "US"
    format: OrderFormat = "json"
    amount: float = Field(default=99.99, gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    customer_name: str | None = None
    items: list[OrderItem] | None = None


class FloodRequest(BaseModel):
    # Kept for backwards compatibility with existing callers, but the path
    # parameter is what is used.
    exchange: str | None = None
    count: int = Field(default=50, ge=1, le=MAX_FLOOD)
    routing_key: str = ""


@router.post("/publish")
def publish_single(req: OrderRequest):
    """Publish one order through all 5 exchange types."""
    items = [item.model_dump() for item in req.items] if req.items else None
    try:
        with publishing_channel() as channel:
            payload = publish_order(
                region=req.region, fmt=req.format,
                amount=req.amount, currency=req.currency,
                customer_name=req.customer_name, items=items,
                channel=channel,
            )
        return {"status": "published", "order_id": payload["order_id"]}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Publish failed: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/batch")
def publish_batch(req: BatchRequest):
    """Publish N orders over a single broker connection."""
    items = [item.model_dump() for item in req.items] if req.items else None
    order_ids: list[str] = []
    try:
        with publishing_channel() as channel:
            for _ in range(req.count):
                payload = publish_order(
                    region=req.region, fmt=req.format,
                    amount=req.amount, currency=req.currency,
                    customer_name=req.customer_name, items=items,
                    channel=channel,
                )
                order_ids.append(payload["order_id"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Batch publish failed after %d/%d orders: %s",
                     len(order_ids), req.count, exc)
        raise HTTPException(
            status_code=503,
            detail=f"Published {len(order_ids)} of {req.count} orders before failing: {exc}",
        ) from exc
    return {"status": "published", "count": len(order_ids), "order_ids": order_ids}


@router.post("/flood/{exchange}")
def flood_exchange(exchange: str, req: FloodRequest):
    """Flood an exchange with N messages (load test helper)."""
    if exchange not in FLOODABLE_EXCHANGES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown exchange {exchange!r}. Expected one of {sorted(EXCHANGES)}.",
        )
    try:
        with publishing_channel() as channel:
            for _ in range(req.count):
                # Fresh properties per message: reusing one object gave every
                # message the same message_id and timestamp.
                body = encode(build_order_payload())
                channel.basic_publish(exchange=exchange,
                                      routing_key=req.routing_key or "",
                                      body=body, properties=build_properties())
        return {"status": "flooded", "exchange": exchange, "count": req.count}
    except Exception as exc:
        logger.error("Flood of %s failed: %s", exchange, exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
