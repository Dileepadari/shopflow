"""FR-05: EU region order processor (headers: region=EU, format=json)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class EuProcessor(BaseConsumer):
    queue_name   = "eu_queue"
    consumer_tag = "eu_processor"
    min_delay, max_delay = 0.3, 1.5

    def process_message(self, payload: dict) -> None:
        logger.info("[EU] Processing order %s (region=%s)",
                    payload.get("order_id"), payload.get("region"))

if __name__ == "__main__":
    EuProcessor().run()
