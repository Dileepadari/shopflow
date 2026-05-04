"""FR-08: Dead Letter Exchange consumer — retries dead-lettered messages and audits final failures."""
import json
from datetime import datetime, timezone
from pathlib import Path
import pika
from src.core.config import settings
from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.core.message_builder import decode, build_properties
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
    death_reason = x_death[0].get("reason", "unknown") if x_death else "unknown"
    original_queue = x_death[0].get("queue", "unknown") if x_death else "unknown"
    retry_count = sum(d.get("count", 0) for d in x_death) if x_death else 0

    if original_queue != "unknown" and retry_count < settings.max_retries:
        self_retry = retry_count + 1
        logger.warning("[DLX] Retry %d/%d for queue '%s' — republishing.",
                       self_retry, settings.max_retries, original_queue)
        republish_props = pika.BasicProperties(
            headers=headers,
            content_type=getattr(properties, "content_type", None),
            delivery_mode=getattr(properties, "delivery_mode", None),
            priority=getattr(properties, "priority", None),
            correlation_id=getattr(properties, "correlation_id", None),
            reply_to=getattr(properties, "reply_to", None),
            expiration=getattr(properties, "expiration", None),
            message_id=getattr(properties, "message_id", None),
            timestamp=getattr(properties, "timestamp", None),
            user_id=getattr(properties, "user_id", None),
            app_id=getattr(properties, "app_id", None),
            cluster_id=getattr(properties, "cluster_id", None),
        )
        channel.basic_publish(
            exchange="",
            routing_key=original_queue,
            body=body,
            properties=republish_props,
        )
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

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
    info_log = json.dumps({
        "order_id": payload.get("order_id", "N/A"),
        "original_queue": original_queue,
        "level": "info",
        "service": "dead_letter_consumer",
        "message": f"Message dead-lettered from {original_queue}",
        "retry_count": retry_count,
    }).encode()
    try:
        channel.basic_publish(exchange="logs.info", routing_key="info",
                            body=info_log, properties=build_properties())
    except Exception:
        pass
    error_log = json.dumps({
        "order_id": payload.get("order_id", "N/A"),
        "original_queue": original_queue,
        "level": "error",
        "service": "dead_letter_consumer",
        "message": f"Message dead-lettered from {original_queue}: {death_reason}",
        "retry_count": retry_count,
    }).encode()
    try:
        channel.basic_publish(exchange="logs.error", routing_key="error",
                            body=error_log, properties=build_properties())
    except Exception:
        pass
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
