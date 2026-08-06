"""FR-04: Audit consumer - receives ALL notifications (topic: #)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.jsonl import append_record, log_path


class NotifAuditConsumer(BaseConsumer):
    queue_name   = "notif_audit_queue"
    consumer_tag = "notif_audit_consumer"
    min_delay, max_delay = 0.01, 0.05

    def process_message(self, payload: dict) -> None:
        append_record(log_path("notification_audit.jsonl"), payload)
        self.logger.info("[AUDIT] Logged notification for order %s",
                         payload.get("order_id"))


if __name__ == "__main__":
    NotifAuditConsumer().run()
