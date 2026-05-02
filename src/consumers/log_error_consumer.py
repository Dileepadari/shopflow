"""FR-03: Error/warning log consumer (direct exchange)."""
import json
from pathlib import Path
from src.consumers._base_consumer import BaseConsumer
from src.utils.logger import setup_logging
logger = setup_logging(__name__)
LOG_FILE = Path("/app/logs/error_logs.jsonl")
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

class LogErrorConsumer(BaseConsumer):
    queue_name   = "log_error_queue"
    consumer_tag = "log_error_consumer"
    min_delay, max_delay = 0.05, 0.2

    def process_message(self, payload: dict) -> None:
        LOG_FILE.open("a").write(json.dumps(payload) + "\n")
        logger.info("[LOG-ERROR] %s: %s", payload.get("level","").upper(), payload.get("message",""))

if __name__ == "__main__":
    LogErrorConsumer().run()
