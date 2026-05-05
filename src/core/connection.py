"""
src.core.connection
~~~~~~~~~~~~~~~~~~~~
Factory for pika connections and channels.
All producers/consumers call get_connection() from here - never raw pika calls.
"""
import time
import logging
import pika
from src.core.config import settings

logger = logging.getLogger(__name__)

def get_connection(retries: int = 15, delay: float = 5.0) -> pika.BlockingConnection:
    """
    Create a pika BlockingConnection to RabbitMQ via HAProxy.
    Retries with delay to handle container startup race conditions.
    """
    credentials = pika.PlainCredentials(settings.rabbitmq_user, settings.rabbitmq_pass)
    parameters = pika.ConnectionParameters(
        host=settings.rabbitmq_host,
        port=settings.rabbitmq_port,
        virtual_host=settings.rabbitmq_vhost,
        credentials=credentials,
        heartbeat=30,
        blocked_connection_timeout=300,
    )
    for attempt in range(1, retries + 1):
        try:
            conn = pika.BlockingConnection(parameters)
            logger.info("Connected to RabbitMQ at %s:%s (attempt %d)",
                        settings.rabbitmq_host, settings.rabbitmq_port, attempt)
            return conn
        except pika.exceptions.AMQPConnectionError as exc:
            logger.warning("Connection attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                time.sleep(delay)
            else:
                raise

def get_channel(connection: pika.BlockingConnection):
    """Open a channel and set fair-dispatch prefetch."""
    channel = connection.channel()
    channel.basic_qos(prefetch_count=settings.prefetch_count)
    return channel
