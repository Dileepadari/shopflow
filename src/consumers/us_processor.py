"""FR-05: US region order processor (headers: region=US, format=json)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class UsProcessor(BaseConsumer):
    queue_name   = "us_queue"
    consumer_tag = "us_processor"
    min_delay, max_delay = 0.3, 1.5

    def process_message(self, payload: dict) -> None:
        logger.info("[US] Processing order %s (region=%s)",
                    payload.get("order_id"), payload.get("region"))

if __name__ == "__main__":
    UsProcessor().run()
