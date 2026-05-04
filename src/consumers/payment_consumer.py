"""FR-01: Payment work queue consumer. Slow (2–5s) simulating payment gateway."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class PaymentConsumer(BaseConsumer):
    queue_name   = "payment_queue"
    consumer_tag = "payment_consumer"
    min_delay, max_delay = 2.0, 5.0

    def process_message(self, payload: dict) -> None:
        if float(payload.get("amount", 0)) <= 0:
            raise ValueError(f"Invalid amount: {payload.get('amount')}")
        logger.info("[PAYMENT] Charging %s %s for order %s",
                    payload.get("currency"), payload.get("amount"), payload.get("order_id"))

if __name__ == "__main__":
    PaymentConsumer().run()
