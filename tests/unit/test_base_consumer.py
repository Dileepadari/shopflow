"""
Tests for BaseConsumer's acknowledgement contract.

These exercise the real _on_message path rather than asserting on attributes the
test itself just assigned, which is what the previous version of this file did.
"""
import json
import signal
from unittest.mock import MagicMock

import pytest

from src.consumers._base_consumer import BaseConsumer
from src.core.message_builder import encode

VALID_BODY = encode({"order_id": "ORD-1", "amount": 10.0, "currency": "USD"})
POISON_BODY = b"__POISON__INVALID_JSON__"


class RecordingConsumer(BaseConsumer):
    """Succeeds by default; set `boom` to make processing raise."""

    queue_name = "test_queue"
    consumer_tag = "test_consumer"
    min_delay = max_delay = 0.0

    def __init__(self, boom=None):
        super().__init__()
        self.boom = boom
        self.processed = []

    def process_message(self, payload):
        if self.boom:
            raise self.boom
        self.processed.append(payload)


@pytest.fixture
def method():
    m = MagicMock()
    m.delivery_tag = 42
    m.routing_key = "test"
    return m


@pytest.fixture
def properties():
    p = MagicMock()
    p.headers = {}
    return p


def published_exchanges(channel):
    return [c.kwargs["exchange"] for c in channel.basic_publish.call_args_list]


class TestSuccessPath:
    def test_acks_after_processing(self, mock_channel, method, properties):
        consumer = RecordingConsumer()
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        assert consumer.processed == [{"order_id": "ORD-1", "amount": 10.0, "currency": "USD"}]
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=42)
        mock_channel.basic_nack.assert_not_called()

    def test_publishes_an_audit_log(self, mock_channel, method, properties):
        RecordingConsumer()._on_message(mock_channel, method, properties, VALID_BODY)
        assert "logs.info" in published_exchanges(mock_channel)

    def test_emit_info_log_false_avoids_the_feedback_loop(self, mock_channel, method, properties):
        """log_info_consumer reads logs.info; publishing there would feed itself."""
        consumer = RecordingConsumer()
        consumer.emit_info_log = False
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        mock_channel.basic_ack.assert_called_once()
        assert "logs.info" not in published_exchanges(mock_channel)

    def test_a_failed_audit_publish_does_not_undo_the_ack(self, mock_channel, method, properties):
        mock_channel.basic_publish.side_effect = RuntimeError("channel closed")
        RecordingConsumer()._on_message(mock_channel, method, properties, VALID_BODY)
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=42)


class TestFailurePath:
    def test_nacks_without_requeue_so_the_message_reaches_the_dlx(
        self, mock_channel, method, properties
    ):
        """requeue=True would never increment x-death and would loop forever."""
        consumer = RecordingConsumer(boom=ValueError("bad amount"))
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        mock_channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)
        mock_channel.basic_ack.assert_not_called()

    def test_reports_the_error(self, mock_channel, method, properties):
        consumer = RecordingConsumer(boom=ValueError("bad amount"))
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        error_calls = [
            c for c in mock_channel.basic_publish.call_args_list
            if c.kwargs["exchange"] == "logs.error"
        ]
        assert len(error_calls) == 1
        assert "bad amount" in json.loads(error_calls[0].kwargs["body"])["message"]

    def test_message_is_still_nacked_when_the_error_log_publish_fails(
        self, mock_channel, method, properties
    ):
        """Regression: an unguarded publish here left the message unacked forever."""
        mock_channel.basic_publish.side_effect = RuntimeError("channel closed")
        consumer = RecordingConsumer(boom=ValueError("bad amount"))
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        mock_channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)

    def test_emit_error_log_false_avoids_the_feedback_loop(
        self, mock_channel, method, properties
    ):
        """log_error_consumer reads logs.error; publishing there would feed itself."""
        consumer = RecordingConsumer(boom=ValueError("boom"))
        consumer.emit_error_log = False
        consumer._on_message(mock_channel, method, properties, VALID_BODY)

        assert "logs.error" not in published_exchanges(mock_channel)
        mock_channel.basic_nack.assert_called_once()


class TestPoisonMessages:
    def test_undecodable_body_is_dead_lettered_not_left_hanging(
        self, mock_channel, method, properties
    ):
        """Regression: this used to raise inside pika's callback, leaving the
        message unacked and the consumer looping on it forever."""
        consumer = RecordingConsumer()
        consumer._on_message(mock_channel, method, properties, POISON_BODY)

        mock_channel.basic_nack.assert_called_once_with(delivery_tag=42, requeue=False)
        assert consumer.processed == []

    def test_poison_does_not_escape_into_the_pika_callback(
        self, mock_channel, method, properties
    ):
        RecordingConsumer()._on_message(mock_channel, method, properties, POISON_BODY)


class TestLifecycle:
    def test_construction_does_not_install_signal_handlers(self):
        """Merely constructing a consumer must not hijack the process's SIGINT."""
        before = signal.getsignal(signal.SIGINT)
        RecordingConsumer()
        assert signal.getsignal(signal.SIGINT) is before

    def test_run_requires_a_queue_and_tag(self):
        class Unconfigured(BaseConsumer):
            def process_message(self, payload):
                pass

        with pytest.raises(ValueError, match="queue_name and consumer_tag"):
            Unconfigured().run()

    def test_consumer_tag_carries_the_container_name(self, monkeypatch):
        """The chaos service matches container names against live consumer tags."""
        monkeypatch.setenv("HOSTNAME", "payment_consumer_1")
        tag = RecordingConsumer()._build_consumer_tag()
        assert "@payment_consumer_1:" in tag
        assert tag.startswith("test_consumer@")

    def test_signal_handler_only_sets_the_stop_flag(self):
        """Calling into pika from a signal handler can corrupt channel state."""
        consumer = RecordingConsumer()
        consumer.channel = MagicMock()
        consumer._signal_handler(signal.SIGTERM, None)

        assert consumer.should_stop is True
        consumer.channel.stop_consuming.assert_not_called()
