"""
Unit tests for message building and formatting.
Tests the core message construction functionality.
"""

import pytest
import json
from datetime import datetime
from src.core.message_builder import (
    build_order,
    build_notification,
    build_log_message
)


class TestOrderMessageBuilding:
    """Tests for order message construction"""
    
    def test_build_order_basic(self):
        """Test building basic order message"""
        order = build_order(
            customer_id="cust_123",
            amount=99.99,
            region="US"
        )
        
        assert order["customer_id"] == "cust_123"
        assert order["amount"] == 99.99
        assert order["region"] == "US"
        assert "order_id" in order
        assert "timestamp" in order
        assert order["status"] == "created"
    
    def test_build_order_with_items(self):
        """Test building order with items"""
        items = [
            {"product_id": "prod_1", "quantity": 2, "price": 50.00},
            {"product_id": "prod_2", "quantity": 1, "price": 49.99}
        ]
        
        order = build_order(
            customer_id="cust_456",
            amount=149.99,
            region="EU",
            items=items
        )
        
        assert order["items"] == items
        assert len(order["items"]) == 2
    
    def test_build_order_invalid_amount(self):
        """Test that invalid amounts raise error"""
        with pytest.raises(ValueError):
            build_order(
                customer_id="cust_789",
                amount=-50.00,
                region="US"
            )
    
    def test_build_order_invalid_region(self):
        """Test that invalid regions raise error"""
        with pytest.raises(ValueError):
            build_order(
                customer_id="cust_789",
                amount=50.00,
                region="INVALID"
            )
    
    def test_build_order_generates_unique_ids(self):
        """Test that each order gets unique ID"""
        order1 = build_order("cust_1", 50.00, "US")
        order2 = build_order("cust_2", 50.00, "US")
        
        assert order1["order_id"] != order2["order_id"]
    
    def test_build_order_timestamp_format(self):
        """Test that timestamp is ISO format"""
        order = build_order("cust_1", 50.00, "US")
        
        # Should be parseable as ISO datetime
        timestamp = datetime.fromisoformat(order["timestamp"])
        assert timestamp is not None


class TestNotificationMessageBuilding:
    """Tests for notification message construction"""
    
    def test_build_notification_email(self):
        """Test building email notification"""
        notif = build_notification(
            type="email",
            recipient="user@example.com",
            subject="Order Confirmation",
            body="Your order has been received"
        )
        
        assert notif["type"] == "email"
        assert notif["recipient"] == "user@example.com"
        assert notif["subject"] == "Order Confirmation"
        assert notif["body"] == "Your order has been received"
    
    def test_build_notification_sms(self):
        """Test building SMS notification"""
        notif = build_notification(
            type="sms",
            recipient="+1234567890",
            body="Your order is being processed"
        )
        
        assert notif["type"] == "sms"
        assert notif["recipient"] == "+1234567890"
    
    def test_build_notification_includes_timestamp(self):
        """Test that notification includes timestamp"""
        notif = build_notification(
            type="email",
            recipient="user@example.com",
            subject="Test",
            body="Test"
        )
        
        assert "timestamp" in notif
        assert "notification_id" in notif


class TestLogMessageBuilding:
    """Tests for log message construction"""
    
    def test_build_log_error(self):
        """Test building error log message"""
        log = build_log_message(
            level="ERROR",
            message="Payment processing failed",
            order_id="order_123"
        )
        
        assert log["level"] == "ERROR"
        assert log["message"] == "Payment processing failed"
        assert log["order_id"] == "order_123"
    
    def test_build_log_info(self):
        """Test building info log message"""
        log = build_log_message(
            level="INFO",
            message="Order received",
            order_id="order_456"
        )
        
        assert log["level"] == "INFO"
        assert log["message"] == "Order received"
    
    def test_build_log_with_context(self):
        """Test building log with additional context"""
        context = {"user_id": "user_1", "action": "checkout"}
        log = build_log_message(
            level="INFO",
            message="Checkout completed",
            order_id="order_789",
            context=context
        )
        
        assert log["context"] == context


class TestMessageSerialization:
    """Tests for message JSON serialization"""
    
    def test_order_serializable(self):
        """Test that order message is JSON serializable"""
        order = build_order("cust_1", 99.99, "US")
        
        # Should not raise
        json_str = json.dumps(order)
        assert json_str is not None
        
        # Should be parseable back
        parsed = json.loads(json_str)
        assert parsed["customer_id"] == "cust_1"
    
    def test_notification_serializable(self):
        """Test that notification is JSON serializable"""
        notif = build_notification(
            type="email",
            recipient="user@example.com",
            subject="Test",
            body="Test"
        )
        
        json_str = json.dumps(notif)
        parsed = json.loads(json_str)
        assert parsed["type"] == "email"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
