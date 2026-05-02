"""
src.utils.retry
~~~~~~~~~~~~~~~
Retry / dead-letter decision logic used by every consumer.
"""
from src.core.config import settings

def get_death_count(headers: dict | None) -> int:
    if not headers or "x-death" not in headers:
        return 0
    x_death = headers["x-death"]
    if isinstance(x_death, list) and len(x_death) > 0:
        return int(x_death[0].get("count", 0))
    return 0

def should_dead_letter(headers: dict | None) -> bool:
    """Return True when the message has exhausted all retry attempts."""
    return get_death_count(headers) >= settings.max_retries
