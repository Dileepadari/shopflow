"""FR-03: Info/debug log consumer (direct exchange)."""
from src.consumers._base_consumer import BaseConsumer


class LogInfoConsumer(BaseConsumer):
    queue_name   = "log_info_queue"
    consumer_tag = "log_info_consumer"
    # No simulated delay - see log_error_consumer. Every successful message in
    # the system publishes an audit line here, so this is the highest-volume
    # queue by far and must not be throttled.
    min_delay, max_delay = 0.0, 0.0
    # This queue carries the log stream every other consumer publishes to, so
    # re-publishing an info log for each message would feed itself.
    emit_info_log = False

    def process_message(self, payload: dict) -> None:
        self.logger.info("[LOG-%s] %s - %s", payload.get("level", "INFO").upper(),
                         payload.get("service"), payload.get("message"))


if __name__ == "__main__":
    LogInfoConsumer().run()
