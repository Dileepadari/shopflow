"""FR-03: Info/debug log consumer (direct exchange)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
from src.core.message_builder import decode
logger = setup_logging(__name__)

class LogInfoConsumer(BaseConsumer):
    queue_name   = "log_info_queue"
    consumer_tag = "log_info_consumer"
    min_delay, max_delay = 0.01, 0.05

    def process_message(self, payload: dict) -> None:
        logger.info("[LOG-%s] %s — %s", payload.get("level","INFO").upper(),
                    payload.get("service"), payload.get("message"))
        
    def _on_message(self, channel, method, properties, body):
        payload = decode(body)
        self.process_message(payload)
        channel.basic_ack(delivery_tag=method.delivery_tag)
        self.logger.info("[%s] ACK'd: %s", self.consumer_tag,
                            payload.get("order_id"))
if __name__ == "__main__":
    LogInfoConsumer().run()
