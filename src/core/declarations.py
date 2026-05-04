"""
src.core.declarations
~~~~~~~~~~~~~~~~~~~~~~
Single source of truth for all RabbitMQ topology.
Called by cluster_init (one-shot) and by every consumer at startup (idempotent).
"""
import logging
import pika
from src.core.config import settings

logger = logging.getLogger(__name__)

def _quorum_args(source_queue: str) -> dict:
    return {
        "x-queue-type": "quorum",
        "x-message-ttl": settings.message_ttl_ms,
        "x-dead-letter-exchange": settings.dlx_exchange,
        "x-dead-letter-routing-key": f"{settings.dlx_routing_key_prefix}.{source_queue}",
    }

def declare_all(channel) -> None:
    """Declare all exchanges, queues, and bindings. Safe to call repeatedly."""
    _declare_dlx(channel)
    _declare_work_queues(channel)
    _declare_fanout(channel)
    _declare_direct(channel)
    _declare_topic(channel)
    _declare_headers(channel)
    logger.info("All ShopFlow topology declared.")

def _declare_dlx(ch):
    ch.exchange_declare(exchange=settings.dlx_exchange, exchange_type="direct", durable=True)
    ch.queue_declare(queue="dead_letter_queue", durable=True,
                     arguments={"x-queue-type": "quorum"})
    for queue in [
        "payment_queue",
        "inventory_queue",
        "email_queue",
        "sms_queue",
        "push_queue",
        "log_error_queue",
        "log_info_queue",
        "order_us_queue",
        "order_eu_queue",
        "order_xml_queue",
        "notif_audit_queue",
    ]:
        ch.queue_bind(
            queue="dead_letter_queue",
            exchange=settings.dlx_exchange,
            routing_key=f"{settings.dlx_routing_key_prefix}.{queue}",
        )

def _declare_work_queues(ch):
    for q in ["payment_queue", "inventory_queue"]:
        ch.queue_declare(queue=q, durable=True, arguments=_quorum_args(q))

def _declare_fanout(ch):
    ch.exchange_declare(exchange="order.events", exchange_type="fanout", durable=True)
    for q in ["email_queue", "sms_queue", "push_queue"]:
        ch.queue_declare(queue=q, durable=True, arguments=_quorum_args(q))
        ch.queue_bind(queue=q, exchange="order.events", routing_key="")

def _declare_direct(ch):
    ch.exchange_declare(exchange="logs.error", exchange_type="direct", durable=True)
    ch.queue_declare(queue="log_error_queue", durable=True,
                     arguments=_quorum_args("log_error_queue"))
    ch.queue_bind(queue="log_error_queue", exchange="logs.error", routing_key="error")
    ch.queue_bind(queue="log_error_queue", exchange="logs.error", routing_key="warning")

    ch.exchange_declare(exchange="logs.info", exchange_type="direct", durable=True)
    ch.queue_declare(queue="log_info_queue", durable=True,
                     arguments=_quorum_args("log_info_queue"))
    ch.queue_bind(queue="log_info_queue", exchange="logs.info", routing_key="info")
    ch.queue_bind(queue="log_info_queue", exchange="logs.info", routing_key="debug")

def _declare_topic(ch):
    ch.exchange_declare(exchange="notifications.topic", exchange_type="topic", durable=True)
    bindings = {
        "notif_email_queue": "notification.email.*",
        "notif_sms_queue":   "notification.sms.urgent",
        "notif_audit_queue": "#",
    }
    for q, pattern in bindings.items():
        ch.queue_declare(queue=q, durable=True, arguments=_quorum_args(q))
        ch.queue_bind(queue=q, exchange="notifications.topic", routing_key=pattern)

def _declare_headers(ch):
    ch.exchange_declare(exchange="orders.headers", exchange_type="headers", durable=True)
    bindings = [
        ("eu_queue",         {"x-match": "all", "region": "EU", "format": "json"}),
        ("us_queue",         {"x-match": "all", "region": "US", "format": "json"}),
        ("xml_legacy_queue", {"x-match": "any", "format": "xml"}),
    ]
    for q, args in bindings:
        ch.queue_declare(queue=q, durable=True, arguments=_quorum_args(q))
        ch.queue_bind(queue=q, exchange="orders.headers", routing_key="", arguments=args)
