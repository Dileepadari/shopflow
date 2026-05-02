"""
src.consumers._base_consumer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Base class for all consumers.
Provides: auto-reconnect, manual ACK/NACK, retry counting, DLX routing.
Subclasses only need to override queue_name, consumer_tag, and process_message().
"""
import logging
import time
import random
import pika

from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import decode
from src.utils.retry import should_dead_letter
from src.utils.logger import setup_logging


class BaseConsumer:
    queue_name: str
    consumer_tag: str
    min_delay: float = 0.1
    max_delay: float = 1.0

    def __init__(self):
        self.logger = setup_logging(self.__class__.__name__)

    def process_message(self, payload: dict) -> None:
        raise NotImplementedError

    def _simulate_work(self) -> None:
        time.sleep(random.uniform(self.min_delay, self.max_delay))

    def _on_message(self, channel, method, properties, body):
        try:
            payload = decode(body)
            self.logger.info("[%s] Received: %s", self.consumer_tag,
                             payload.get("order_id", "N/A"))
            self.process_message(payload)
            self._simulate_work()
            channel.basic_ack(delivery_tag=method.delivery_tag)
            self.logger.info("[%s] ACK'd: %s", self.consumer_tag,
                             payload.get("order_id"))
        except Exception as exc:
            self.logger.error("[%s] Error: %s", self.consumer_tag, exc)
            headers = getattr(properties, "headers", None) or {}
            if should_dead_letter(headers):
                self.logger.warning("[%s] Max retries — dead-lettering.", self.consumer_tag)
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            else:
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

    def run(self) -> None:
        self.logger.info("[%s] Starting on queue: %s", self.consumer_tag, self.queue_name)
        while True:
            try:
                connection = get_connection()
                channel = get_channel(connection)
                declare_all(channel)
                channel.basic_consume(
                    queue=self.queue_name,
                    on_message_callback=self._on_message,
                    auto_ack=False,
                )
                self.logger.info("[%s] Waiting for messages. CTRL+C to stop.", self.consumer_tag)
                channel.start_consuming()
            except pika.exceptions.AMQPConnectionError:
                self.logger.warning("[%s] Lost connection — retry in 5s.", self.consumer_tag)
                time.sleep(5)
            except KeyboardInterrupt:
                self.logger.info("[%s] Stopping.", self.consumer_tag)
                break
