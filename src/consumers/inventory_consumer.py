"""FR-01: Inventory work queue consumer. Reserves stock (0.5–2s)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)

class InventoryConsumer(BaseConsumer):
    queue_name   = "inventory_queue"
    consumer_tag = "inventory_consumer"
    min_delay, max_delay = 0.5, 2.0

    def process_message(self, payload: dict) -> None:
        logger.info("[INVENTORY] Reserving %d item(s) for order %s",
                    len(payload.get("items", [])), payload.get("order_id"))

if __name__ == "__main__":
    InventoryConsumer().run()
