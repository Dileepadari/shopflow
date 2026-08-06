"""FR-04: Email notification handler (topic: notification.email.*)."""
from src.consumers._base_consumer import BaseConsumer


class NotifEmailConsumer(BaseConsumer):
    queue_name   = "notif_email_queue"
    consumer_tag = "notif_email_consumer"
    min_delay, max_delay = 0.3, 1.0

    def process_message(self, payload: dict) -> None:
        self.logger.info("[NOTIF-EMAIL] Email to %s for order %s",
                    payload.get("customer_email"), payload.get("order_id"))

if __name__ == "__main__":
    NotifEmailConsumer().run()
