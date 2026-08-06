"""
src.producers.order_producer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Publishes a single order through ALL 5 exchange types simultaneously.
Called by the Producer API; can also be run standalone.
"""
import json
from contextlib import contextmanager

from src.core.connection import get_channel, get_connection
from src.core.message_builder import build_order_payload, build_properties, encode
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

#: Routing keys the topic exchange is exercised with (FR-04).
NOTIFICATION_ROUTING_KEYS = (
    "notification.email.normal",
    "notification.email.urgent",
    "notification.sms.urgent",
    "notification.sms.normal",
    "notification.push.normal",
)

VALID_REGIONS = frozenset({"US", "EU"})
VALID_FORMATS = frozenset({"json", "xml"})


@contextmanager
def _publishing_channel(channel=None):
    """Yield a confirm-mode channel, owning the connection only if we opened it."""
    if channel is not None:
        yield channel
        return
    connection = get_connection()
    try:
        own_channel = get_channel(connection)
        # Turn basic_publish into a synchronous, checkable operation. Without
        # this it is fire-and-forget and never raises, which made the
        # payment-before-inventory ordering below meaningless.
        own_channel.confirm_delivery()
        yield own_channel
    finally:
        try:
            if connection.is_open:
                connection.close()
        except Exception as exc:
            logger.debug("Error closing producer connection: %s", exc)


def validate_order_inputs(region: str, fmt: str) -> None:
    """Reject values the headers exchange has no binding for.

    An unroutable order would otherwise be dropped silently by the broker.
    """
    if region not in VALID_REGIONS:
        raise ValueError(f"Unsupported region {region!r}. Expected one of {sorted(VALID_REGIONS)}.")
    if fmt not in VALID_FORMATS:
        raise ValueError(f"Unsupported format {fmt!r}. Expected one of {sorted(VALID_FORMATS)}.")


def publish_order(region: str = "US", fmt: str = "json",
                  amount: float = 99.99, currency: str = "USD",
                  customer_name: str | None = None,
                  items: list | None = None,
                  channel=None) -> dict:
    """Publish one order to every exchange type.

    ``channel`` lets a long-lived caller (the Producer API) reuse a connection
    instead of opening one per order. It must already be in confirm mode.
    """
    validate_order_inputs(region, fmt)

    payload = build_order_payload(region=region, fmt=fmt, amount=amount,
                                  currency=currency, items=items,
                                  customer_name=customer_name)
    body = encode(payload)
    order_id = payload["order_id"]

    with _publishing_channel(channel) as ch:
        try:
            # FR-01 work queues, in order: inventory is only reserved once the
            # payment message is confirmed by the broker. mandatory=True turns an
            # unroutable message into an exception rather than a silent drop.
            ch.basic_publish(exchange="", routing_key="payment_queue", body=body,
                             properties=build_properties(), mandatory=True)
            logger.info("Order %s queued for payment.", order_id)

            ch.basic_publish(exchange="", routing_key="inventory_queue", body=body,
                             properties=build_properties(), mandatory=True)
            logger.info("Order %s queued for inventory.", order_id)

            # FR-02 fanout: email, SMS and push all receive this.
            ch.basic_publish(exchange="order.events", routing_key="", body=body,
                             properties=build_properties())

            # FR-03 direct log routing.
            ch.basic_publish(exchange="logs.info", routing_key="info",
                             body=json.dumps({
                                 "order_id": order_id,
                                 "level": "info",
                                 "service": "order_producer",
                                 "message": f"Order {order_id} published successfully",
                             }).encode(),
                             properties=build_properties())

            # FR-04 topic routing across every priority/channel combination.
            for key in NOTIFICATION_ROUTING_KEYS:
                ch.basic_publish(exchange="notifications.topic", routing_key=key,
                                 body=body, properties=build_properties())

            # FR-05 headers routing by region and format.
            ch.basic_publish(exchange="orders.headers", routing_key="", body=body,
                             properties=build_properties(
                                 headers={"region": region, "format": fmt}),
                             mandatory=True)

        except Exception as exc:
            logger.error("Failed to publish order %s: %s", order_id, exc)
            # Best-effort: the channel is usually already dead by this point, and
            # an exception here would mask the real one.
            try:
                ch.basic_publish(exchange="logs.error", routing_key="error",
                                 body=json.dumps({
                                     "order_id": order_id,
                                     "level": "error",
                                     "service": "order_producer",
                                     "message": f"Order {order_id} failed to publish: {exc}",
                                 }).encode(),
                                 properties=build_properties())
            except Exception:
                logger.debug("Could not record the publish failure for %s.", order_id)
            raise

    logger.info("Order %s published (region=%s, format=%s).", order_id, region, fmt)
    return payload


if __name__ == "__main__":
    import sys
    cli_region = sys.argv[1] if len(sys.argv) > 1 else "US"
    cli_fmt = sys.argv[2] if len(sys.argv) > 2 else "json"
    publish_order(region=cli_region, fmt=cli_fmt)
