"""FR-02: Push notification consumer (fanout)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class PushConsumer(BaseConsumer):
    queue_name   = "push_queue"
    consumer_tag = "push_consumer"
    min_delay, max_delay = 0.05, 0.3

    def process_message(self, payload: dict) -> None:
        logger.info("[PUSH] Push notification for order %s", payload.get("order_id"))

if __name__ == "__main__":
    PushConsumer().run()
