"""FR-08: Dead Letter Exchange consumer — audits all failed messages."""
import json
from datetime import datetime, timezone
from pathlib import Path
import pika
from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import decode
from src.utils.logger import setup_logging

logger = setup_logging(__name__)
DLX_LOG = Path("/app/logs/dead_letters.jsonl")
DLX_LOG.parent.mkdir(parents=True, exist_ok=True)

def on_dead_letter(channel, method, properties, body):
    try:
        payload = decode(body)
    except Exception:
        payload = {"raw": body.decode("utf-8", errors="replace")}
    headers = properties.headers or {}
    x_death = headers.get("x-death", [])
    death_reason   = x_death[0].get("reason", "unknown")   if x_death else "unknown"
    original_queue = x_death[0].get("queue",  "unknown")   if x_death else "unknown"
    retry_count    = sum(d.get("count", 0) for d in x_death) if x_death else 0
    record = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "original_queue": original_queue,
        "routing_key": method.routing_key,
        "death_reason": death_reason,
        "retry_count": retry_count,
        "message_body": payload,
    }
    DLX_LOG.open("a").write(json.dumps(record) + "\n")
    logger.warning("[DLX] From '%s' | reason: %s | retries: %d | order: %s",
                   original_queue, death_reason, retry_count,
                   payload.get("order_id", "N/A"))
    channel.basic_ack(delivery_tag=method.delivery_tag)

def run():
    import time
    while True:
        try:
            conn = get_connection()
            ch   = get_channel(conn)
            declare_all(ch)
            ch.basic_consume(queue="dead_letter_queue",
                             on_message_callback=on_dead_letter, auto_ack=False)
            logger.info("[DLX] Waiting for dead-lettered messages.")
            ch.start_consuming()
        except pika.exceptions.AMQPConnectionError:
            logger.warning("[DLX] Lost connection — retry in 5s.")
            time.sleep(5)
        except KeyboardInterrupt:
            break

if __name__ == "__main__":
    run()
