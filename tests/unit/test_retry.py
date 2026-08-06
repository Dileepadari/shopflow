"""Tests for the retry budget (src.utils.retry)."""
import pytest

from src.core.config import settings
from src.utils.retry import (
    get_death_count,
    get_death_reason,
    get_original_queue,
    should_dead_letter,
    should_retry,
)


def x_death(count=1, reason="rejected", queue="payment_queue"):
    return {"x-death": [{"count": count, "reason": reason, "queue": queue}]}


class TestDeathCount:
    @pytest.mark.parametrize("headers", [None, {}, {"other": "value"}])
    def test_no_x_death_means_zero(self, headers):
        assert get_death_count(headers) == 0

    def test_reads_the_most_recent_entry(self):
        assert get_death_count(x_death(count=3)) == 3

    def test_malformed_x_death_is_tolerated(self):
        """The broker owns this header, but a republish could mangle it."""
        assert get_death_count({"x-death": "not-a-list"}) == 0
        assert get_death_count({"x-death": []}) == 0
        assert get_death_count({"x-death": ["not-a-dict"]}) == 0
        assert get_death_count({"x-death": [{"count": "abc"}]}) == 0


class TestMetadata:
    def test_reads_reason_and_queue(self):
        headers = x_death(reason="expired", queue="eu_queue")
        assert get_death_reason(headers) == "expired"
        assert get_original_queue(headers) == "eu_queue"

    def test_unknown_when_absent(self):
        assert get_death_reason({}) == "unknown"
        assert get_original_queue({}) == "unknown"


class TestBudget:
    def test_under_the_limit_is_not_exhausted(self):
        assert not should_dead_letter(x_death(count=settings.max_retries - 1))

    def test_at_the_limit_is_exhausted(self):
        assert should_dead_letter(x_death(count=settings.max_retries))

    def test_over_the_limit_is_exhausted(self):
        assert should_dead_letter(x_death(count=settings.max_retries + 5))


class TestRetryDecision:
    def test_rejected_message_with_budget_left_is_retried(self):
        assert should_retry(x_death(count=1, reason="rejected"))

    def test_exhausted_message_is_not_retried(self):
        assert not should_retry(x_death(count=settings.max_retries, reason="rejected"))

    def test_expired_message_is_not_retried(self):
        """Republishing into the same TTL'd queue would just expire again,
        burning the whole budget for nothing."""
        assert not should_retry(x_death(count=1, reason="expired"))

    def test_unknown_origin_is_not_retried(self):
        """Without the original queue there is nowhere to republish it to."""
        assert not should_retry(x_death(count=1, queue="unknown"))

    def test_no_headers_is_not_retried(self):
        assert not should_retry(None)
