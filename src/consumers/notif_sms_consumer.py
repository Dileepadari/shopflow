"""FR-04: Urgent SMS handler (topic: notification.sms.urgent only)."""
from src.consumers._base_consumer import BaseConsumer


class NotifSmsConsumer(BaseConsumer):
    queue_name   = "notif_sms_queue"
    consumer_tag = "notif_sms_consumer"
    min_delay, max_delay = 0.2, 0.6

    def process_message(self, payload: dict) -> None:
        self.logger.info("[NOTIF-SMS-URGENT] SMS to %s for order %s",
                    payload.get("customer_phone"), payload.get("order_id"))

if __name__ == "__main__":
    NotifSmsConsumer().run()
