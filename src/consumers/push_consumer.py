"""FR-02: Push notification consumer (fanout)."""
from src.consumers._base_consumer import BaseConsumer


class PushConsumer(BaseConsumer):
    queue_name   = "push_queue"
    consumer_tag = "push_consumer"
    min_delay, max_delay = 0.05, 0.3

    def process_message(self, payload: dict) -> None:
        self.logger.info("[PUSH] Push notification for order %s", payload.get("order_id"))

if __name__ == "__main__":
    PushConsumer().run()
