"""FR-02: Email notification consumer (fanout - receives all order events)."""
from src.consumers._base_consumer import BaseConsumer


class EmailConsumer(BaseConsumer):
    queue_name   = "email_queue"
    consumer_tag = "email_consumer"
    min_delay, max_delay = 0.2, 0.8

    def process_message(self, payload: dict) -> None:
        self.logger.info("[EMAIL] Sending confirmation to %s for order %s",
                    payload.get("customer_email"), payload.get("order_id"))

if __name__ == "__main__":
    EmailConsumer().run()
