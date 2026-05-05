"""
src.consumers._base_consumer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Base class for all consumers.
Provides: auto-reconnect, manual ACK/NACK, DLX routing.
Subclasses only need to override queue_name, consumer_tag, and process_message().
"""
import logging
import time
import random
import json
import pika
import signal
import os

from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import decode, build_properties
from src.utils.logger import setup_logging


class BaseConsumer:
    queue_name: str
    consumer_tag: str
    min_delay: float = 0.1
    max_delay: float = 1.0
    connection_refresh_interval: int = 300  # Reconnect every 5 minutes for load balancing

    def __init__(self):
        self.logger = setup_logging(self.__class__.__name__)
        self.channel = None
        self.connection = None
        self.should_stop = False
        self.connection_start_time = None
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        self.logger.warning("[%s] Received signal %d - shutting down gracefully", self.consumer_tag, signum)
        self.should_stop = True
        if self.channel and not self.channel.is_closed:
            self.channel.stop_consuming()

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
            info_log = json.dumps({
                "order_id": payload.get("order_id", "N/A"),
                "consumer": self.consumer_tag,
                "level": "info",
                "service": "consumer",
                "message": f"Message processed successfully",
            }).encode()
            
            channel.basic_publish(exchange="logs.info", routing_key="info",
                                    body=info_log, properties=build_properties())
           
        except Exception as exc:
            self.logger.error("[%s] Error: %s", self.consumer_tag, exc)
            error_log = json.dumps({
                "order_id": payload.get("order_id", "N/A") if 'payload' in locals() else "N/A",
                "consumer": self.consumer_tag,
                "level": "error",
                "service": "consumer",
                "message": str(exc),
            }).encode()
        
            channel.basic_publish(exchange="logs.error", routing_key="error",
                                    body=error_log, properties=build_properties())
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    def run(self) -> None:
        self.logger.info("[%s] Starting on queue: %s", self.consumer_tag, self.queue_name)
        while not self.should_stop:
            try:
                self.connection = get_connection()
                self.channel = get_channel(self.connection)
                declare_all(self.channel)
                
                # Set QoS to 1 - only accept 1 message at a time
                self.channel.basic_qos(prefetch_count=1)
                
                # Add random suffix to consumer_tag to avoid conflicts with ghost consumers
                unique_tag = f"{self.consumer_tag}_{os.getpid()}_{int(time.time() * 1000) % 10000}"
                
                self.channel.basic_consume(
                    queue=self.queue_name,
                    on_message_callback=self._on_message,
                    auto_ack=False,
                    consumer_tag=unique_tag
                )
                self.logger.info("[%s] Waiting for messages (tag: %s, refresh in %ds). CTRL+C to stop.", 
                                self.consumer_tag, unique_tag, self.connection_refresh_interval)
                
                # Record connection start time for periodic refresh
                self.connection_start_time = time.time()
                
                # Use non-blocking consume with periodic refresh check
                while not self.should_stop:
                    try:
                        # Process events with timeout to allow periodic checks
                        self.connection.process_data_events(time_limit=1)
                        
                        # Check if connection needs refresh for load balancing
                        if time.time() - self.connection_start_time > self.connection_refresh_interval:
                            self.logger.info("[%s] Connection age exceeds %ds - reconnecting for load balancing",
                                           self.consumer_tag, self.connection_refresh_interval)
                            break  # Exit inner loop to trigger reconnect
                    except KeyboardInterrupt:
                        self.logger.info("[%s] Stopping.", self.consumer_tag)
                        self.should_stop = True
                        break
                
                # If we exit the inner loop due to should_stop, break outer loop too
                if self.should_stop:
                    break
                    
            except pika.exceptions.AMQPConnectionError as e:
                self.logger.warning("[%s] Lost connection: %s - retry in 5s.", self.consumer_tag, str(e))
                time.sleep(5)
                if self.should_stop:
                    break
            except KeyboardInterrupt:
                self.logger.info("[%s] Stopping.", self.consumer_tag)
                self.should_stop = True
                break
            except Exception as e:
                self.logger.error("[%s] Unexpected error: %s - retry in 5s.", self.consumer_tag, str(e))
                time.sleep(5)
                if self.should_stop:
                    break
            finally:
                # Cleanup on exit or error
                if self.channel and not self.channel.is_closed:
                    try:
                        self.channel.close()
                    except Exception:
                        pass
                if self.connection and self.connection.is_open:
                    try:
                        self.connection.close()
                    except Exception:
                        pass
