"""
FR-08: Dead Letter Exchange consumer.

Owns the retry budget for the whole system. Every other consumer NACKs failures
with requeue=False, which routes the message here and increments its x-death
count. This consumer decides whether to give the message another attempt or to
archive it for forensic review.
"""
import json
from datetime import UTC, datetime

import pika

from src.consumers._base_consumer import BaseConsumer
from src.core.config import settings
from src.core.message_builder import decode
from src.utils.jsonl import append_record, log_path
from src.utils.retry import (
    get_death_reason,
    get_original_queue,
    get_retry_count,
    next_retry_headers,
    should_retry,
)

DLX_LOG_FILENAME = "dead_letters.jsonl"

#: Queues that carry the log stream itself. A dead letter originating from one of
#: these must not produce an error notice, because that notice is published to
#: logs.error and lands straight back in log_error_queue. Once that queue is deep
#: enough for messages to hit their TTL, every expiry generates a replacement and
#: the queue feeds itself without limit.
LOG_QUEUES = frozenset({"log_error_queue", "log_info_queue"})


class DeadLetterConsumer(BaseConsumer):
    queue_name   = "dead_letter_queue"
    consumer_tag = "dead_letter_consumer"
    # Nothing to simulate - this is bookkeeping, not business work.
    min_delay, max_delay = 0.0, 0.0

    def _on_message(self, channel, method, properties, body):
        """Overridden because dead letters need the raw headers and must never
        themselves be dead-lettered - there is nowhere further for them to go."""
        try:
            payload = decode(body)
        except Exception:
            payload = {"raw": body.decode("utf-8", errors="replace")}

        headers = (properties.headers if properties else None) or {}
        original_queue = get_original_queue(headers)
        reason = get_death_reason(headers)
        attempts = get_retry_count(headers)
        correlation_id = self._correlation_id(properties, payload)

        if should_retry(headers):
            self._republish(channel, method, properties, body,
                            original_queue, attempts, headers)
            return

        self._archive(channel, method, payload, original_queue, reason, attempts,
                      correlation_id)

    def _republish(self, channel, method, properties, body, original_queue: str,
                   attempts: int, headers: dict) -> None:
        self.logger.warning("[DLX] Retry %d/%d for queue '%s' - republishing.",
                            attempts + 1, settings.max_retries, original_queue)
        republish_props = pika.BasicProperties(
            # Carries our own incremented attempt counter. Without it the
            # message returns with a fresh x-death and retries forever.
            headers=next_retry_headers(headers),
            content_type=properties.content_type,
            content_encoding=properties.content_encoding,
            delivery_mode=properties.delivery_mode,
            priority=properties.priority,
            correlation_id=properties.correlation_id,
            reply_to=properties.reply_to,
            expiration=properties.expiration,
            message_id=properties.message_id,
            timestamp=properties.timestamp,
            type=properties.type,
            user_id=properties.user_id,
            app_id=properties.app_id,
        )
        try:
            channel.basic_publish(exchange="", routing_key=original_queue,
                                  body=body, properties=republish_props)
        except Exception as exc:
            # Could not hand it back; archive instead of losing it.
            self.logger.error("[DLX] Republish to '%s' failed: %s", original_queue, exc)
            self._archive(channel, method, {"raw": body.decode("utf-8", errors="replace")},
                          original_queue, f"republish_failed: {exc}", attempts,
                          self._correlation_id(properties))
            return
        channel.basic_ack(delivery_tag=method.delivery_tag)

    def _archive(self, channel, method, payload: dict, original_queue: str,
                 reason: str, attempts: int,
                 correlation_id: str | None = None) -> None:
        record = {
            "received_at": datetime.now(UTC).isoformat(),
            "original_queue": original_queue,
            "routing_key": method.routing_key,
            "death_reason": reason,
            "retry_count": attempts,
            # Ties this failure back to the order that produced it.
            "correlation_id": correlation_id,
            "message_body": payload,
        }
        try:
            append_record(log_path(DLX_LOG_FILENAME), record)
        except OSError as exc:
            # Never let a disk problem strand the message unacked.
            self.logger.error("[DLX] Could not write audit record: %s", exc)

        self.logger.warning("[DLX] From '%s' | reason: %s | retries: %d | order: %s",
                            original_queue, reason, attempts,
                            payload.get("order_id", "N/A"))

        if original_queue not in LOG_QUEUES:
            self._safe_publish(channel, "logs.error", "error", json.dumps({
                "order_id": payload.get("order_id", "N/A"),
                "original_queue": original_queue,
                "level": "error",
                "service": "dead_letter_consumer",
                "message": f"Message dead-lettered from {original_queue}: {reason}",
                "retry_count": attempts,
            }).encode(), correlation_id)

        channel.basic_ack(delivery_tag=method.delivery_tag)


if __name__ == "__main__":
    DeadLetterConsumer().run()
