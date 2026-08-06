"""
src.core.connection
~~~~~~~~~~~~~~~~~~~~
Factory for pika connections and channels.
All producers/consumers call get_connection() from here - never raw pika calls.
"""
import socket
import time

import pika

from src.core.config import settings
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

#: Long budget for services that start alongside the broker and can afford to wait.
STARTUP_RETRIES = 15
#: Short budget for anything on an HTTP request path - a caller should get an
#: error quickly rather than have the request hang for over a minute.
REQUEST_RETRIES = 3

#: Failures that are worth another attempt: the broker may still be starting,
#: or DNS for the haproxy service may not have resolved yet.
_RETRIABLE = (pika.exceptions.AMQPConnectionError, socket.gaierror, OSError)


def connection_parameters() -> pika.ConnectionParameters:
    return pika.ConnectionParameters(
        host=settings.rabbitmq_host,
        port=settings.rabbitmq_port,
        virtual_host=settings.rabbitmq_vhost,
        credentials=pika.PlainCredentials(settings.rabbitmq_user, settings.rabbitmq_pass),
        heartbeat=30,
        # Kept under HAProxy's 1m client/server timeout so the proxy does not cut
        # a blocked connection before pika notices.
        blocked_connection_timeout=50,
    )


def get_connection(retries: int = STARTUP_RETRIES,
                   delay: float = 5.0) -> pika.BlockingConnection:
    """Create a pika BlockingConnection to RabbitMQ via HAProxy.

    Retries to handle container startup race conditions. Raises the last error
    once the budget is exhausted.
    """
    retries = max(1, retries)
    parameters = connection_parameters()
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            conn = pika.BlockingConnection(parameters)
            logger.info("Connected to RabbitMQ at %s:%s (attempt %d).",
                        settings.rabbitmq_host, settings.rabbitmq_port, attempt)
            return conn
        except pika.exceptions.ProbableAuthenticationError:
            # Credentials will not fix themselves; fail immediately.
            logger.error("Authentication failed for user %r on vhost %r.",
                         settings.rabbitmq_user, settings.rabbitmq_vhost)
            raise
        except _RETRIABLE as exc:
            last_error = exc
            logger.warning("Connection attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                time.sleep(delay)

    raise pika.exceptions.AMQPConnectionError(
        f"Could not connect to RabbitMQ at {settings.rabbitmq_host}:"
        f"{settings.rabbitmq_port} after {retries} attempts: {last_error}"
    )


def get_channel(connection: pika.BlockingConnection):
    """Open a channel and set fair-dispatch prefetch (FR-01).

    global_qos is explicitly False: RabbitMQ 4.x rejects channel-wide QoS, and
    quorum queues never supported it.
    """
    channel = connection.channel()
    channel.basic_qos(prefetch_count=settings.prefetch_count, global_qos=False)
    return channel
