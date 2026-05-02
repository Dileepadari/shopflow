"""FR-02: SMS notification consumer (fanout)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class SmsConsumer(BaseConsumer):
    queue_name   = "sms_queue"
    consumer_tag = "sms_consumer"
    min_delay, max_delay = 0.1, 0.5

    def process_message(self, payload: dict) -> None:
        logger.info("[SMS] Sending SMS to %s for order %s",
                    payload.get("customer_phone"), payload.get("order_id"))

if __name__ == "__main__":
    SmsConsumer().run()
