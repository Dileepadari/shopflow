"""
Unit tests for message building and formatting.
Adapted to use the functions actually present in src.core.message_builder.
"""

import pytest
import json
from datetime import datetime
from src.core.message_builder import (
    build_order_payload,
    encode,
    decode,
    build_properties,
)


class TestOrderMessageBuilding:
    """Tests for order message construction"""
    
    def test_build_order_basic(self):
        """Test building basic order message"""
        order = build_order_payload(
            customer_name="cust_123",
            amount=99.99,
            region="US",
            fmt="json",
        )
        
        assert order["customer_name"] == "cust_123"
        assert order["amount"] == 99.99
        assert order["region"] == "US"
        assert "order_id" in order
        assert "timestamp" in order
    
    def test_build_order_with_items(self):
        """Test building order with items"""
        items = [
            {"product_id": "prod_1", "quantity": 2, "price": 50.00},
            {"product_id": "prod_2", "quantity": 1, "price": 49.99}
        ]
        
        order = build_order_payload(
            customer_name="cust_456",
            amount=149.99,
            region="EU",
            items=items
        )
        
        assert order["items"] == items
        assert len(order["items"]) == 2

    def test_build_order_negative_amount_allowed(self):
        """Negative amounts are accepted by build_order_payload (no validation enforced)."""
        order = build_order_payload(customer_name="c", amount=-10.0, region="US")
        assert order["amount"] == -10.0

    def test_build_order_generates_unique_ids(self):
        """Test that each order gets unique ID"""
        order1 = build_order_payload(customer_name="cust_1", amount=50.0, region="US")
        order2 = build_order_payload(customer_name="cust_2", amount=50.0, region="US")
        
        assert order1["order_id"] != order2["order_id"]
    
    def test_build_order_timestamp_format(self):
        """Test that timestamp is ISO format"""
        order = build_order_payload(customer_name="cust_1", amount=50.0, region="US")
        
        # Should be parseable as ISO datetime
        timestamp = datetime.fromisoformat(order["timestamp"])
        assert timestamp is not None


class TestNotificationMessageBuilding:
    """Basic tests around serialization and properties for notifications/logs."""
    
    def test_encode_decode_roundtrip(self):
        payload = {"type": "email", "recipient": "user@example.com", "body": "hi"}
        body = encode(payload)
        parsed = decode(body)
        assert parsed["recipient"] == "user@example.com"

    def test_build_properties_defaults(self):
        props = build_properties()
        assert props.content_type == "application/json"
        assert isinstance(props.headers, dict)


class TestLogMessageBuilding:
    def test_serialization_and_headers(self):
        log = {"level": "ERROR", "message": "fail", "order_id": "o1"}
        body = encode(log)
        parsed = decode(body)
        assert parsed["level"] == "ERROR"
        props = build_properties(headers={"service": "consumer"})
        assert props.headers.get("service") == "consumer"


class TestMessageSerialization:
    """Tests for message JSON serialization"""
    
    def test_order_serializable(self):
        order = build_order_payload(customer_name="cust_1", amount=99.99, region="US")
        
        # Should not raise
        json_str = json.dumps(order)
        assert json_str is not None
        
        # Should be parseable back
        parsed = json.loads(json_str)
        assert parsed["customer_name"] == "cust_1"



if __name__ == "__main__":
    pytest.main([__file__, "-v"])
