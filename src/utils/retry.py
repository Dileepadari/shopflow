"""
src.utils.retry
~~~~~~~~~~~~~~~
Retry / dead-letter decision logic.

The single definition of "how many times has this message died". RabbitMQ writes
one x-death entry per (queue, reason) pair and increments its ``count``; the
first entry is the most recent death, which is the one the retry budget is
measured against.
"""
from typing import Any

from src.core.config import settings

#: Death reasons that a retry can plausibly fix. A message that expired will
#: simply expire again if republished into the same TTL'd queue, so retrying it
#: burns the whole budget for nothing.
RETRIABLE_REASONS = frozenset({"rejected"})

#: Our own attempt counter, set by dead_letter_consumer when it republishes.
#:
#: The broker's x-death cannot be relied on here. It is broker-managed and does
#: not survive a manual republish: the message re-enters the queue as a brand new
#: message, so the next dead-lettering starts its count at 1 again. Counting on
#: x-death alone means the budget never runs out and a poison message cycles
#: between the queue and the DLX forever, emitting an error log every lap.
RETRY_HEADER = "x-shopflow-retries"


def _first_death(headers: dict | None) -> dict[str, Any]:
    if not headers:
        return {}
    x_death = headers.get("x-death")
    if isinstance(x_death, list) and x_death:
        entry = x_death[0]
        return entry if isinstance(entry, dict) else {}
    return {}


def get_death_count(headers: dict | None) -> int:
    """How many times this message has been dead-lettered."""
    try:
        return int(_first_death(headers).get("count", 0))
    except (TypeError, ValueError):
        return 0


def get_death_reason(headers: dict | None) -> str:
    """Why it was dead-lettered: rejected, expired, maxlen or delivery_limit."""
    return str(_first_death(headers).get("reason", "unknown"))


def get_original_queue(headers: dict | None) -> str:
    """The queue the message was originally consumed from."""
    return str(_first_death(headers).get("queue", "unknown"))


def get_retry_count(headers: dict | None) -> int:
    """How many attempts this message has already had.

    Prefers our own counter and falls back to x-death, which is correct for a
    message that has reached the DLX without ever being republished.
    """
    if headers and RETRY_HEADER in headers:
        try:
            return int(headers[RETRY_HEADER])
        except (TypeError, ValueError):
            pass
    return get_death_count(headers)


def next_retry_headers(headers: dict | None) -> dict:
    """Headers for a republished message: the app's own, with the counter bumped.

    x-death is dropped deliberately - it is broker-managed, and echoing a stale
    copy back confuses the next dead-lettering.
    """
    carried = {k: v for k, v in (headers or {}).items() if k != "x-death"}
    carried[RETRY_HEADER] = get_retry_count(headers) + 1
    return carried


def should_dead_letter(headers: dict | None) -> bool:
    """True when the message has exhausted its retry budget."""
    return get_retry_count(headers) >= settings.max_retries


def should_retry(headers: dict | None) -> bool:
    """True when the message is worth republishing to its original queue."""
    return (
        get_original_queue(headers) != "unknown"
        and get_death_reason(headers) in RETRIABLE_REASONS
        and not should_dead_letter(headers)
    )
