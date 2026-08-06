"""FR-03: Error/warning log consumer (direct exchange)."""
from src.consumers._base_consumer import BaseConsumer
from src.utils.jsonl import append_record, log_path


class LogErrorConsumer(BaseConsumer):
    queue_name   = "log_error_queue"
    consumer_tag = "log_error_consumer"
    # No simulated delay. The other consumers sleep to imitate a slow external
    # call, but this one only appends a line - and it is the sink every other
    # consumer publishes failures to, so throttling it means a burst of errors
    # cannot drain inside the 60s TTL and the whole burst dead-letters.
    min_delay, max_delay = 0.0, 0.0
    # This consumer reads the error stream. Publishing an error on failure would
    # route straight back into its own queue and loop.
    emit_error_log = False

    def process_message(self, payload: dict) -> None:
        append_record(log_path("error_logs.jsonl"), payload)
        self.logger.info("[LOG-ERROR] %s: %s",
                         payload.get("level", "").upper(), payload.get("message", ""))


if __name__ == "__main__":
    LogErrorConsumer().run()
