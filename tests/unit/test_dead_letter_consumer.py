"""
Tests for the DLX consumer, which owns the retry budget.

This module had no coverage at all before, because importing it used to create
/app/logs at import time and raise PermissionError outside a container.
"""
import json
from unittest.mock import MagicMock

import pytest

from src.consumers.dead_letter_consumer import DLX_LOG_FILENAME, DeadLetterConsumer
from src.core.config import settings
from src.core.message_builder import encode
from src.utils.jsonl import read_records
from src.utils.retry import RETRY_HEADER

BODY = encode({"order_id": "ORD-9", "amount": 5.0})


@pytest.fixture
def method():
    m = MagicMock()
    m.delivery_tag = 7
    m.routing_key = "dlx.payment_queue"
    return m


def make_properties(count=1, reason="rejected", queue="payment_queue"):
    props = MagicMock()
    props.headers = {"x-death": [{"count": count, "reason": reason, "queue": queue}]}
    for field in ("content_type", "content_encoding", "priority", "correlation_id",
                  "reply_to", "expiration", "message_id", "timestamp", "type",
                  "user_id", "app_id"):
        setattr(props, field, None)
    props.delivery_mode = 2
    return props


class TestRetry:
    def test_republishes_to_the_original_queue(self, mock_channel, method):
        DeadLetterConsumer()._on_message(mock_channel, method, make_properties(count=1), BODY)

        mock_channel.basic_publish.assert_called_once()
        call = mock_channel.basic_publish.call_args
        assert call.kwargs["exchange"] == ""
        assert call.kwargs["routing_key"] == "payment_queue"
        assert call.kwargs["body"] == BODY
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=7)

    def test_does_not_forward_the_x_death_header(self, mock_channel, method):
        """x-death is broker-managed; echoing it back confuses the next count."""
        DeadLetterConsumer()._on_message(mock_channel, method, make_properties(count=1), BODY)
        republished = mock_channel.basic_publish.call_args.kwargs["properties"]
        assert "x-death" not in republished.headers

    def test_republish_carries_an_incremented_attempt_counter(self, mock_channel, method):
        DeadLetterConsumer()._on_message(mock_channel, method, make_properties(count=1), BODY)
        headers = mock_channel.basic_publish.call_args.kwargs["properties"].headers
        assert headers[RETRY_HEADER] == 2

    def test_retry_budget_is_actually_exhausted_over_a_full_cycle(
        self, mock_channel, method, log_dir
    ):
        """Regression: the budget must terminate.

        Because a manual republish gives the message a brand new x-death, a
        counter based on x-death alone resets every lap and the message cycles
        between the queue and the DLX forever. Observed on a live stack as
        10,000+ error logs from ten poison messages.

        This simulates the real loop: each republish comes back with whatever
        headers we set, plus a fresh single-death x-death from the broker.
        """
        consumer = DeadLetterConsumer()
        headers = {"x-death": [{"count": 1, "reason": "rejected", "queue": "payment_queue"}]}

        republishes = 0
        for _ in range(settings.max_retries + 5):
            mock_channel.reset_mock()
            props = MagicMock()
            props.headers = headers
            for field in ("content_type", "content_encoding", "priority", "correlation_id",
                          "reply_to", "expiration", "message_id", "timestamp", "type",
                          "user_id", "app_id"):
                setattr(props, field, None)
            props.delivery_mode = 2

            consumer._on_message(mock_channel, method, props, BODY)

            sent = [c for c in mock_channel.basic_publish.call_args_list
                    if c.kwargs["routing_key"] == "payment_queue"]
            if not sent:
                break
            republishes += 1
            # The broker re-adds a fresh x-death on the next dead-lettering.
            headers = dict(sent[0].kwargs["properties"].headers)
            headers["x-death"] = [{"count": 1, "reason": "rejected", "queue": "payment_queue"}]

        assert republishes == settings.max_retries - 1, (
            f"expected the budget to stop after {settings.max_retries - 1} republishes, "
            f"got {republishes}"
        )
        assert read_records(log_dir / DLX_LOG_FILENAME), "message was never archived"

    def test_archives_instead_of_losing_the_message_if_republish_fails(
        self, mock_channel, method, log_dir
    ):
        mock_channel.basic_publish.side_effect = RuntimeError("channel closed")
        DeadLetterConsumer()._on_message(mock_channel, method, make_properties(count=1), BODY)

        mock_channel.basic_ack.assert_called_once_with(delivery_tag=7)
        assert read_records(log_dir / DLX_LOG_FILENAME)


class TestArchive:
    def test_exhausted_message_is_written_to_the_audit_log(self, mock_channel, method, log_dir):
        properties = make_properties(count=settings.max_retries)
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        records = read_records(log_dir / DLX_LOG_FILENAME)
        assert len(records) == 1
        record = records[0]
        assert record["original_queue"] == "payment_queue"
        assert record["death_reason"] == "rejected"
        assert record["retry_count"] == settings.max_retries
        assert record["message_body"]["order_id"] == "ORD-9"
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=7)

    def test_expired_message_is_archived_rather_than_retried(
        self, mock_channel, method, log_dir
    ):
        properties = make_properties(count=1, reason="expired")
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        # Only the logs.error notice, no republish to the original queue.
        routing_keys = [c.kwargs["routing_key"] for c in mock_channel.basic_publish.call_args_list]
        assert "payment_queue" not in routing_keys
        assert read_records(log_dir / DLX_LOG_FILENAME)[0]["death_reason"] == "expired"

    def test_undecodable_body_is_archived_raw(self, mock_channel, method, log_dir):
        properties = make_properties(count=settings.max_retries)
        DeadLetterConsumer()._on_message(
            mock_channel, method, properties, b"__POISON__INVALID_JSON__"
        )

        record = read_records(log_dir / DLX_LOG_FILENAME)[0]
        assert record["message_body"]["raw"] == "__POISON__INVALID_JSON__"
        mock_channel.basic_ack.assert_called_once()

    def test_publishes_an_error_notice(self, mock_channel, method, log_dir):
        properties = make_properties(count=settings.max_retries)
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        errors = [
            json.loads(c.kwargs["body"])
            for c in mock_channel.basic_publish.call_args_list
            if c.kwargs["exchange"] == "logs.error"
        ]
        assert len(errors) == 1
        assert errors[0]["original_queue"] == "payment_queue"

    @pytest.mark.parametrize("queue", ["log_error_queue", "log_info_queue"])
    def test_no_error_notice_for_dead_letters_from_the_log_queues(
        self, mock_channel, method, log_dir, queue
    ):
        """Regression: publishing an error notice about a message that died
        coming out of log_error_queue sends it straight back into that same
        queue. Once the queue is deep enough for TTL expiry, every expiry
        generates a replacement and it grows without bound - observed at 11,500
        messages within a minute on a live stack."""
        properties = make_properties(count=1, reason="expired", queue=queue)
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        exchanges = [c.kwargs["exchange"] for c in mock_channel.basic_publish.call_args_list]
        assert "logs.error" not in exchanges
        # Still archived and acknowledged, just not announced.
        assert read_records(log_dir / DLX_LOG_FILENAME)
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=7)

    def test_error_notice_is_still_published_for_ordinary_queues(
        self, mock_channel, method, log_dir
    ):
        properties = make_properties(count=settings.max_retries, queue="payment_queue")
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        exchanges = [c.kwargs["exchange"] for c in mock_channel.basic_publish.call_args_list]
        assert "logs.error" in exchanges

    def test_message_is_still_acked_when_the_audit_write_fails(
        self, mock_channel, method, monkeypatch
    ):
        """A full disk must not strand dead letters on the queue."""
        from src.consumers import dead_letter_consumer

        def boom(*_args, **_kwargs):
            raise OSError("no space left on device")

        monkeypatch.setattr(dead_letter_consumer, "append_record", boom)
        properties = make_properties(count=settings.max_retries)
        DeadLetterConsumer()._on_message(mock_channel, method, properties, BODY)

        mock_channel.basic_ack.assert_called_once_with(delivery_tag=7)
