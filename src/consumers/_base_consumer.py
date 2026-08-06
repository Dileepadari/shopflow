"""
src.consumers._base_consumer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Base class for all consumers.
Provides: auto-reconnect, manual ACK/NACK, DLX routing, graceful shutdown.
Subclasses only need to override queue_name, consumer_tag, and process_message().
"""
import json
import os
import random
import signal
import socket
import time

import pika

from src.core.connection import get_channel, get_connection
from src.core.message_builder import build_properties, decode
from src.utils.logger import setup_logging

RECONNECT_DELAY_SECONDS = 5


class BaseConsumer:
    #: Queue this consumer reads from. Required.
    queue_name: str = ""
    #: Stable identifier used in logs and as the consumer-tag prefix. Required.
    consumer_tag: str = ""
    #: Simulated processing time, per FR-01/FR-02.
    min_delay: float = 0.1
    max_delay: float = 1.0
    #: Reconnect periodically so HAProxy can rebalance long-lived AMQP connections.
    connection_refresh_interval: int = 300
    #: Publish an audit line to logs.info on each successful ACK. Disabled by the
    #: log consumers themselves, which would otherwise feed their own queue.
    emit_info_log: bool = True
    #: Publish to logs.error on failure. Disabled by log_error_consumer for the
    #: same reason - a failure there would publish another error to its own queue.
    emit_error_log: bool = True

    def __init__(self):
        self.logger = setup_logging(self.__class__.__name__)
        self.channel = None
        self.connection = None
        self.should_stop = False
        self.connection_start_time = None

    # ------------------------------------------------------------------ hooks

    def process_message(self, payload: dict) -> None:
        raise NotImplementedError

    def _simulate_work(self) -> None:
        time.sleep(random.uniform(self.min_delay, self.max_delay))

    # -------------------------------------------------------------- lifecycle

    def _install_signal_handlers(self) -> None:
        """Install handlers from run(), not __init__.

        signal.signal() only works on the main thread and hijacks the process's
        SIGINT, so merely constructing a consumer (as the tests do) must not do it.
        """
        try:
            signal.signal(signal.SIGTERM, self._signal_handler)
            signal.signal(signal.SIGINT, self._signal_handler)
        except ValueError:
            self.logger.debug("Not on the main thread - signal handlers not installed.")

    def _signal_handler(self, signum, frame):
        """Flag shutdown only.

        pika's BlockingConnection is not reentrant, so calling into the channel
        from a signal handler while the main thread sits inside
        process_data_events() can corrupt channel state. The run loop polls
        should_stop once per second, which is prompt enough.
        """
        self.logger.warning("[%s] Received signal %d - shutting down gracefully.",
                            self.consumer_tag, signum)
        self.should_stop = True

    # ------------------------------------------------------------- publishing

    def _safe_publish(self, channel, exchange: str, routing_key: str, body: bytes) -> None:
        """Best-effort publish that can never prevent the caller from ACK/NACKing.

        An unguarded publish here would escape into pika's dispatch loop and
        leave the in-flight message unacked forever.
        """
        try:
            channel.basic_publish(exchange=exchange, routing_key=routing_key,
                                  body=body, properties=build_properties())
        except Exception as exc:
            self.logger.warning("[%s] Could not publish to %s: %s",
                                self.consumer_tag, exchange, exc)

    # ---------------------------------------------------------- message entry

    def _on_message(self, channel, method, properties, body):
        order_id = "N/A"
        try:
            payload = decode(body)
        except Exception as exc:
            # Undecodable payload: no amount of retrying will help, so send it
            # straight to the DLX for forensic review (FR-08).
            self.logger.error("[%s] Undecodable message, dead-lettering: %s",
                              self.consumer_tag, exc)
            self._report_error(channel, order_id, f"decode failed: {exc}")
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            return

        try:
            order_id = payload.get("order_id", "N/A")
            self.logger.info("[%s] Received: %s", self.consumer_tag, order_id)
            self.process_message(payload)
            self._simulate_work()
        except Exception as exc:
            self.logger.error("[%s] Error processing %s: %s",
                              self.consumer_tag, order_id, exc)
            self._report_error(channel, order_id, str(exc))
            # requeue=False routes the message to the dead letter exchange, which
            # increments its x-death count. dead_letter_consumer owns the retry
            # budget from there (FR-07). Requeueing instead would never increment
            # x-death and would loop forever on a poison message.
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            return

        channel.basic_ack(delivery_tag=method.delivery_tag)
        self.logger.info("[%s] ACK'd: %s", self.consumer_tag, order_id)

        if self.emit_info_log:
            self._safe_publish(channel, "logs.info", "info", json.dumps({
                "order_id": order_id,
                "consumer": self.consumer_tag,
                "level": "info",
                "service": "consumer",
                "message": "Message processed successfully",
            }).encode())

    def _report_error(self, channel, order_id: str, message: str) -> None:
        if not self.emit_error_log:
            return
        self._safe_publish(channel, "logs.error", "error", json.dumps({
            "order_id": order_id,
            "consumer": self.consumer_tag,
            "level": "error",
            "service": "consumer",
            "message": message,
        }).encode())

    # ----------------------------------------------------------------- runner

    def _build_consumer_tag(self) -> str:
        """Unique per process, but prefixed with the container name.

        The chaos service matches dashboard container names against live
        consumer tags, so the container hostname has to be in here.
        """
        host = os.getenv("HOSTNAME") or socket.gethostname()
        return f"{self.consumer_tag}@{host}:{os.getpid()}"

    def run(self) -> None:
        if not self.queue_name or not self.consumer_tag:
            raise ValueError(
                f"{type(self).__name__} must set queue_name and consumer_tag."
            )
        self._install_signal_handlers()
        self.logger.info("[%s] Starting on queue: %s", self.consumer_tag, self.queue_name)

        while not self.should_stop:
            try:
                self.connection = get_connection()
                self.channel = get_channel(self.connection)
                # Topology is owned by cluster_init; consumers only consume.
                # global_qos stays False - RabbitMQ 4.x rejects global QoS.
                self.channel.basic_qos(prefetch_count=1, global_qos=False)

                tag = self._build_consumer_tag()
                self.channel.basic_consume(
                    queue=self.queue_name,
                    on_message_callback=self._on_message,
                    auto_ack=False,
                    consumer_tag=tag,
                )
                self.logger.info(
                    "[%s] Waiting for messages (tag: %s, refresh in %ds). CTRL+C to stop.",
                    self.consumer_tag, tag, self.connection_refresh_interval)

                self.connection_start_time = time.time()
                while not self.should_stop:
                    self.connection.process_data_events(time_limit=1)
                    if time.time() - self.connection_start_time > self.connection_refresh_interval:
                        self.logger.info(
                            "[%s] Connection age exceeds %ds - reconnecting to rebalance.",
                            self.consumer_tag, self.connection_refresh_interval)
                        break

            except pika.exceptions.AMQPConnectionError as exc:
                self.logger.warning("[%s] Lost connection: %s - retry in %ds.",
                                    self.consumer_tag, exc, RECONNECT_DELAY_SECONDS)
                self._sleep_before_retry()
            except pika.exceptions.ChannelClosedByBroker as exc:
                # Almost always a 406 PRECONDITION_FAILED from an argument change
                # on an existing queue. Say so, rather than looping silently.
                self.logger.error(
                    "[%s] Broker closed the channel: %s. If queue arguments changed, "
                    "the stack needs `docker compose down -v` to recreate the topology.",
                    self.consumer_tag, exc)
                self._sleep_before_retry()
            except KeyboardInterrupt:
                self.logger.info("[%s] Stopping.", self.consumer_tag)
                self.should_stop = True
            except Exception as exc:
                self.logger.error("[%s] Unexpected error: %s - retry in %ds.",
                                  self.consumer_tag, exc, RECONNECT_DELAY_SECONDS)
                self._sleep_before_retry()
            finally:
                self._close()

        self.logger.info("[%s] Stopped.", self.consumer_tag)

    def _sleep_before_retry(self) -> None:
        for _ in range(RECONNECT_DELAY_SECONDS):
            if self.should_stop:
                return
            time.sleep(1)

    def _close(self) -> None:
        for closeable in (self.channel, self.connection):
            try:
                if closeable is not None and not closeable.is_closed:
                    closeable.close()
            except Exception as exc:
                self.logger.debug("[%s] Error during close: %s", self.consumer_tag, exc)
        self.channel = None
        self.connection = None
