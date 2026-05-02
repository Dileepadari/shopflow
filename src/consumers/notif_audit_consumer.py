"""FR-04: Audit consumer — receives ALL notifications (topic: #)."""
import json
from pathlib import Path
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)
AUDIT_FILE = Path("/app/logs/notification_audit.jsonl")
AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)

class NotifAuditConsumer(BaseConsumer):
    queue_name   = "notif_audit_queue"
    consumer_tag = "notif_audit_consumer"
    min_delay, max_delay = 0.01, 0.05

    def process_message(self, payload: dict) -> None:
        AUDIT_FILE.open("a").write(json.dumps(payload) + "\n")
        logger.info("[AUDIT] Logged notification for order %s", payload.get("order_id"))

if __name__ == "__main__":
    NotifAuditConsumer().run()
