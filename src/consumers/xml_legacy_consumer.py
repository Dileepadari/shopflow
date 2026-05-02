"""FR-05: XML legacy format processor (headers: format=xml, any region)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class XmlLegacyConsumer(BaseConsumer):
    queue_name   = "xml_legacy_queue"
    consumer_tag = "xml_legacy_consumer"
    min_delay, max_delay = 0.5, 2.0

    def process_message(self, payload: dict) -> None:
        logger.info("[XML-LEGACY] Processing XML order %s", payload.get("order_id"))

if __name__ == "__main__":
    XmlLegacyConsumer().run()
