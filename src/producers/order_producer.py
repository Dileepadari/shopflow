"""
src.producers.order_producer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Publishes a single order through ALL 5 exchange types simultaneously.
Called by the Producer API; can also be run standalone.
"""
import json
import logging
from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import build_properties, build_order_payload, encode
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

def publish_order(region: str = "US", fmt: str = "json",
                  amount: float = 99.99, currency: str = "USD") -> dict:
    connection = get_connection()
    channel = get_channel(connection)
    declare_all(channel)
    payload = build_order_payload(region=region, fmt=fmt,
                                amount=amount, currency=currency)
    body = encode(payload)
    order_id = payload["order_id"]
    try:
        # FR-01: Work queues (default exchange)
        for q in ["payment_queue", "inventory_queue"]:
            channel.basic_publish(exchange="", routing_key=q, body=body,
                                properties=build_properties())

        # FR-02: Fanout
        channel.basic_publish(exchange="order.events", routing_key="", body=body,
                            properties=build_properties())

        # FR-03: Direct logs — route all log messages to error and info logs
        info_body = json.dumps({
            "order_id": order_id, "level": "info",
            "service": "order_producer",
            "message": f"Order {order_id} published successfully",
        }).encode()
        channel.basic_publish(exchange="logs.info", routing_key="info",
                            body=info_body, properties=build_properties())

        # FR-04: Topic notifications
        for key in ["notification.email.normal", "notification.email.urgent",
                    "notification.sms.urgent", "notification.sms.normal",
                    "notification.push.normal"]:
            channel.basic_publish(exchange="notifications.topic", routing_key=key,
                                body=body, properties=build_properties())

        # FR-05: Headers exchange
        channel.basic_publish(
            exchange="orders.headers", routing_key="", body=body,
            properties=build_properties(headers={"region": region, "format": fmt}),
        )

        connection.close()
        logger.info("Order %s published (region=%s, format=%s)", order_id, region, fmt)
        return payload
    except Exception as exc:
        log_body = json.dumps({
            "order_id": order_id, "level": "error",
            "service": "order_producer",
            "message": f"Order {order_id} published",
        }).encode()
        channel.basic_publish(exchange="logs.error", routing_key="error",
                          body=log_body, properties=build_properties())
        raise exc
if __name__ == "__main__":
    import sys
    region = sys.argv[1] if len(sys.argv) > 1 else "US"
    fmt    = sys.argv[2] if len(sys.argv) > 2 else "json"
    publish_order(region=region, fmt=fmt)
