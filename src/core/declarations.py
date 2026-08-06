"""
src.core.declarations
~~~~~~~~~~~~~~~~~~~~~~
Single source of truth for all RabbitMQ topology.
Called by cluster_init (one-shot) and by every consumer at startup (idempotent).

Every queue in ``QUEUES`` is declared with a dead-letter routing key of
``<dlx_prefix>.<queue_name>``, and the DLX bindings are derived from the very
same list. That derivation is deliberate: the two used to be maintained by hand
and drifted, which silently discarded dead letters for five of the queues.
"""
import logging
from dataclasses import dataclass, field

from src.core.config import settings

logger = logging.getLogger(__name__)

#: Exchange name -> AMQP exchange type. All are durable.
EXCHANGES: dict[str, str] = {
    "order.events": "fanout",           # FR-02 publish/subscribe
    "logs.error": "direct",             # FR-03 targeted log routing
    "logs.info": "direct",              # FR-03
    "notifications.topic": "topic",     # FR-04 pattern routing
    "orders.headers": "headers",        # FR-05 region routing
}

#: The dead letter queue itself. Declared separately: it has no TTL (records are
#: kept until reviewed) and no dead-letter-exchange of its own (nowhere to go).
DLX_QUEUE = "dead_letter_queue"


@dataclass(frozen=True)
class QueueSpec:
    """One work queue and how it is bound to its exchange."""

    name: str
    #: None means the queue is fed through the default (nameless) exchange.
    exchange: str | None = None
    #: Routing keys / binding patterns. Empty string is a valid fanout key.
    routing_keys: tuple[str, ...] = ()
    #: Header-match arguments, headers exchanges only.
    bind_arguments: dict[str, str] | None = None
    #: Consumer container(s) that read this queue - documentation for the dev guide.
    consumers: tuple[str, ...] = field(default_factory=tuple)


QUEUES: tuple[QueueSpec, ...] = (
    # FR-01 work queues, fed via the default exchange by routing key = queue name.
    QueueSpec("payment_queue", consumers=("payment_consumer_1", "payment_consumer_2")),
    QueueSpec("inventory_queue", consumers=("inventory_consumer_1", "inventory_consumer_2")),
    # FR-02 fanout: all three receive every order event.
    QueueSpec("email_queue", "order.events", ("",), consumers=("email_consumer",)),
    QueueSpec("sms_queue", "order.events", ("",), consumers=("sms_consumer",)),
    QueueSpec("push_queue", "order.events", ("",), consumers=("push_consumer",)),
    # FR-03 direct log routing.
    QueueSpec("log_error_queue", "logs.error", ("error", "warning"),
              consumers=("log_error_consumer",)),
    QueueSpec("log_info_queue", "logs.info", ("info", "debug"),
              consumers=("log_info_consumer",)),
    # FR-04 topic notification routing.
    QueueSpec("notif_email_queue", "notifications.topic", ("notification.email.*",),
              consumers=("notif_email_consumer",)),
    QueueSpec("notif_sms_queue", "notifications.topic", ("notification.sms.urgent",),
              consumers=("notif_sms_consumer",)),
    QueueSpec("notif_audit_queue", "notifications.topic", ("#",),
              consumers=("notif_audit_consumer",)),
    # FR-05 headers-based region routing. Header keys must match the ones set by
    # src/producers/order_producer.py when publishing to orders.headers.
    QueueSpec("eu_queue", "orders.headers", ("",),
              {"x-match": "all", "region": "EU", "format": "json"},
              consumers=("eu_processor",)),
    QueueSpec("us_queue", "orders.headers", ("",),
              {"x-match": "all", "region": "US", "format": "json"},
              consumers=("us_processor",)),
    QueueSpec("xml_legacy_queue", "orders.headers", ("",),
              {"x-match": "any", "format": "xml"},
              consumers=("xml_legacy_consumer",)),
)

#: Fast lookup used by the chaos service and tests.
QUEUES_BY_NAME: dict[str, QueueSpec] = {q.name: q for q in QUEUES}


def dlx_routing_key(queue_name: str) -> str:
    """The DLX routing key a message from ``queue_name`` is dead-lettered with."""
    return f"{settings.dlx_routing_key_prefix}.{queue_name}"


def _quorum_args(source_queue: str) -> dict:
    """Queue arguments shared by every work queue (FR-06, FR-10)."""
    return {
        "x-queue-type": "quorum",
        "x-message-ttl": settings.message_ttl_ms,
        "x-dead-letter-exchange": settings.dlx_exchange,
        "x-dead-letter-routing-key": dlx_routing_key(source_queue),
    }


def declare_all(channel) -> None:
    """Declare all exchanges, queues, and bindings. Safe to call repeatedly."""
    _declare_exchanges(channel)
    _declare_dlx(channel)
    _declare_queues(channel)
    logger.info("All ShopFlow topology declared (%d exchanges, %d queues).",
                len(EXCHANGES) + 1, len(QUEUES) + 1)


def _declare_exchanges(channel) -> None:
    for name, ex_type in EXCHANGES.items():
        channel.exchange_declare(exchange=name, exchange_type=ex_type, durable=True)


def _declare_dlx(channel) -> None:
    """FR-08: the dead letter exchange, its queue, and one binding per source queue."""
    channel.exchange_declare(exchange=settings.dlx_exchange,
                             exchange_type="direct", durable=True)
    # No TTL and no onward DLX - dead letters stay until reviewed.
    channel.queue_declare(queue=DLX_QUEUE, durable=True,
                          arguments={"x-queue-type": "quorum"})
    for spec in QUEUES:
        channel.queue_bind(queue=DLX_QUEUE,
                           exchange=settings.dlx_exchange,
                           routing_key=dlx_routing_key(spec.name))


def _declare_queues(channel) -> None:
    for spec in QUEUES:
        channel.queue_declare(queue=spec.name, durable=True,
                              arguments=_quorum_args(spec.name))
        if spec.exchange is None:
            continue  # reached through the default exchange, no binding needed
        for routing_key in spec.routing_keys:
            channel.queue_bind(queue=spec.name, exchange=spec.exchange,
                               routing_key=routing_key,
                               arguments=spec.bind_arguments)
