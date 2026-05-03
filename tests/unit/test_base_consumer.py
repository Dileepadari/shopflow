"""
Unit tests for base consumer functionality.
Tests consumer initialization and message processing patterns.
"""

import pytest
import json
from unittest.mock import Mock, MagicMock, patch
from src.consumers._base_consumer import BaseConsumer


class TestBaseConsumerInitialization:
    """Tests for consumer initialization"""
    
    def test_consumer_initialization(self):
        """Test basic consumer initialization"""
        consumer = BaseConsumer(
            queue_name="test_queue",
            exchange_name="test_exchange",
            exchange_type="fanout",
            routing_key=""
        )
        
        assert consumer.queue_name == "test_queue"
        assert consumer.exchange_name == "test_exchange"
        assert consumer.exchange_type == "fanout"
        assert consumer.routing_key == ""
    
    def test_consumer_with_direct_exchange(self):
        """Test consumer with direct exchange"""
        consumer = BaseConsumer(
            queue_name="logs_queue",
            exchange_name="logs.direct",
            exchange_type="direct",
            routing_key="error"
        )
        
        assert consumer.exchange_type == "direct"
        assert consumer.routing_key == "error"
    
    def test_consumer_with_topic_exchange(self):
        """Test consumer with topic exchange"""
        consumer = BaseConsumer(
            queue_name="notif_queue",
            exchange_name="notifications.topic",
            exchange_type="topic",
            routing_key="notif.#"
        )
        
        assert consumer.exchange_type == "topic"
        assert consumer.routing_key == "notif.#"


class TestConsumerMessageProcessing:
    """Tests for message processing"""
    
    @patch('pika.BlockingConnection')
    def test_consumer_success_acks_message(self, mock_conn):
        """Test that successful processing ACKs message"""
        # Setup mock
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        class TestConsumer(BaseConsumer):
            def process(self, message_body):
                return True
        
        consumer = TestConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        # Simulate message delivery
        method = Mock(delivery_tag=1)
        properties = Mock()
        body = json.dumps({"test": "data"})
        
        # Process
        consumer._on_message(mock_channel, method, properties, body)
        
        # Verify ACK
        mock_channel.basic_ack.assert_called_once_with(delivery_tag=1)
    
    @patch('pika.BlockingConnection')
    def test_consumer_error_nacks_message(self, mock_conn):
        """Test that error processing NACKs message with requeue"""
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        class TestConsumer(BaseConsumer):
            def process(self, message_body):
                return False  # Retriable error
        
        consumer = TestConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        method = Mock(delivery_tag=1)
        properties = Mock()
        body = json.dumps({"test": "data"})
        
        consumer._on_message(mock_channel, method, properties, body)
        
        # Verify NACK with requeue
        mock_channel.basic_nack.assert_called_once()
        call_args = mock_channel.basic_nack.call_args
        assert call_args[1].get('requeue') is True


class TestConsumerErrorHandling:
    """Tests for error handling"""
    
    @patch('pika.BlockingConnection')
    def test_consumer_handles_invalid_json(self, mock_conn):
        """Test handling of invalid JSON messages"""
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        consumer = BaseConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        method = Mock(delivery_tag=1)
        properties = Mock()
        body = b"invalid json {{{{"  # Invalid JSON
        
        consumer._on_message(mock_channel, method, properties, body)
        
        # Should NACK because of invalid JSON
        mock_channel.basic_nack.assert_called()
    
    @patch('pika.BlockingConnection')
    def test_consumer_handles_empty_message(self, mock_conn):
        """Test handling of empty messages"""
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        consumer = BaseConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        method = Mock(delivery_tag=1)
        properties = Mock()
        body = b""  # Empty
        
        consumer._on_message(mock_channel, method, properties, body)
        
        # Should handle gracefully
        mock_channel.basic_nack.assert_called()


class TestConsumerQueueDeclaration:
    """Tests for queue and exchange declaration"""
    
    @patch('pika.BlockingConnection')
    def test_declare_fanout_queue(self, mock_conn):
        """Test declaring fanout exchange and queue"""
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        consumer = BaseConsumer(
            queue_name="notif_queue",
            exchange_name="order.events",
            exchange_type="fanout"
        )
        
        # Verify exchange declared with correct parameters
        mock_channel.exchange_declare.assert_called()
        call_args = mock_channel.exchange_declare.call_args
        assert call_args[1]['exchange'] == "order.events"
        assert call_args[1]['exchange_type'] == "fanout"
        assert call_args[1]['durable'] is True
    
    @patch('pika.BlockingConnection')
    def test_declare_durable_queue(self, mock_conn):
        """Test declaring durable queue"""
        mock_channel = MagicMock()
        mock_conn.return_value.channel.return_value = mock_channel
        
        consumer = BaseConsumer(
            queue_name="test_queue",
            exchange_name="test",
            exchange_type="direct"
        )
        
        # Verify queue declared with durable=True
        mock_channel.queue_declare.assert_called()
        call_args = mock_channel.queue_declare.call_args
        assert call_args[1]['durable'] is True


class TestConsumerRetryLogic:
    """Tests for retry counting and logic"""
    
    def test_retry_count_increments(self):
        """Test that retry counter increments"""
        consumer = BaseConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        # Initial count
        assert consumer.get_retry_count() == 0
        
        # Increment
        consumer.increment_retry_count()
        assert consumer.get_retry_count() == 1
        
        # Increment again
        consumer.increment_retry_count()
        assert consumer.get_retry_count() == 2


class TestConsumerConnectionResilience:
    """Tests for connection resilience"""
    
    @patch('pika.BlockingConnection')
    def test_consumer_reconnects_on_failure(self, mock_conn):
        """Test that consumer reconnects on connection failure"""
        # First call fails, second succeeds
        mock_conn.side_effect = [
            Exception("Connection failed"),
            MagicMock()
        ]
        
        consumer = BaseConsumer(
            queue_name="test",
            exchange_name="test",
            exchange_type="fanout"
        )
        
        # Should attempt to reconnect
        # (In real implementation, this would retry with backoff)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
