"""
Direct message publishing, for exercising routing patterns by hand.

Useful for testing a binding without going through the Producer API - for
example publishing to orders.headers with specific headers to see which region
queue it lands in.
"""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.core.connection import REQUEST_RETRIES, get_connection
from src.core.declarations import EXCHANGES
from src.core.message_builder import build_properties
from src.utils.logger import setup_logging

logger = setup_logging(__name__)
router = APIRouter(tags=["Message Publishing"])

MAX_BATCH = 500
#: "default" and "" both mean the AMQP default (nameless) exchange.
DEFAULT_EXCHANGE_ALIASES = {"", "default"}


class PublishMessageRequest(BaseModel):
    exchange: str = Field(..., description="Exchange name, or '' / 'default' for the AMQP default exchange")
    routing_key: str = Field(default="", description="Routing key (ignored by fanout and headers exchanges)")
    body: dict = Field(..., description="Message body as a JSON object")
    headers: dict = Field(default_factory=dict, description="AMQP headers, used by the headers exchange")
    persistent: bool = Field(default=True, description="Write to disk before confirming (delivery_mode=2)")


class PublishMessageResponse(BaseModel):
    status: str
    exchange: str
    routing_key: str
    message: dict


def _resolve_exchange(name: str) -> str:
    if name in DEFAULT_EXCHANGE_ALIASES:
        return ""
    if name not in EXCHANGES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown exchange {name!r}. Expected '' or one of {sorted(EXCHANGES)}.",
        )
    return name


def _publish(channel, req: PublishMessageRequest) -> None:
    properties = build_properties(headers=req.headers or None)
    if not req.persistent:
        properties.delivery_mode = 1
    channel.basic_publish(
        exchange=_resolve_exchange(req.exchange),
        routing_key=req.routing_key or "",
        body=json.dumps(req.body).encode("utf-8"),
        properties=properties,
    )


@router.post("/message/publish", response_model=PublishMessageResponse)
def publish_message(req: PublishMessageRequest):
    """Publish one message directly to an exchange."""
    exchange = _resolve_exchange(req.exchange)
    # Bound before the try so the finally below can never raise UnboundLocalError
    # and mask the real exception - which is exactly what used to happen when
    # opening the channel failed, leaking the connection with it.
    connection = None
    try:
        connection = get_connection(retries=REQUEST_RETRIES, delay=2.0)
        channel = connection.channel()
        _publish(channel, req)
        logger.info("Published to exchange=%r routing_key=%r persistent=%s",
                    exchange, req.routing_key, req.persistent)
        return PublishMessageResponse(status="published", exchange=req.exchange,
                                      routing_key=req.routing_key, message=req.body)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to publish message: %s", exc)
        raise HTTPException(status_code=503, detail=f"Failed to publish message: {exc}") from exc
    finally:
        _close(connection)


@router.post("/message/publish-batch")
def publish_batch_messages(messages: list[PublishMessageRequest]):
    """Publish several messages over one connection.

    Typed as a list of PublishMessageRequest so each entry is validated - the
    previous bare `list` annotation skipped validation entirely and silently
    dropped the headers field, so headers-exchange routing never worked here.
    """
    if not messages:
        raise HTTPException(status_code=422, detail="Provide at least one message.")
    if len(messages) > MAX_BATCH:
        raise HTTPException(status_code=422, detail=f"At most {MAX_BATCH} messages per batch.")

    published, errors = 0, []
    connection = None
    try:
        connection = get_connection(retries=REQUEST_RETRIES, delay=2.0)
        channel = connection.channel()
        for index, req in enumerate(messages):
            try:
                _publish(channel, req)
                published += 1
            except HTTPException as exc:
                errors.append({"index": index, "error": exc.detail})
            except Exception as exc:
                errors.append({"index": index, "error": str(exc)})
                logger.error("Failed to publish message %d: %s", index, exc)
    except Exception as exc:
        logger.error("Failed to publish batch: %s", exc)
        raise HTTPException(status_code=503, detail=f"Failed to publish batch: {exc}") from exc
    finally:
        _close(connection)

    return {
        "status": "batch_published",
        "total": len(messages),
        "published": published,
        "failed": len(errors),
        "errors": errors or None,
    }


def _close(connection) -> None:
    try:
        if connection is not None and connection.is_open:
            connection.close()
    except Exception as exc:
        logger.debug("Error closing publish connection: %s", exc)
