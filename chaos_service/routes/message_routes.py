"""
Message publishing routes for chaos service.
Allows direct publishing of messages to exchanges for testing.
"""

import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import pika

from ..services.rabbitmq_service import RabbitMQService

logger = logging.getLogger(__name__)
router = APIRouter()


class PublishMessageRequest(BaseModel):
    """Request model for publishing a message to an exchange."""
    exchange: str = Field(..., description="Exchange name (e.g., 'order.events')")
    routing_key: str = Field(
        default="",
        description="Routing key for the message (optional for fanout)"
    )
    body: dict = Field(
        ...,
        description="Message body as JSON object"
    )
    headers: dict = Field(
        default_factory=dict,
        description="AMQP message headers for headers exchange routing (e.g., {'region': 'EU', 'format': 'json'})"
    )
    persistent: bool = Field(
        default=True,
        description="Whether to make message persistent (delivery_mode=2)"
    )


class PublishMessageResponse(BaseModel):
    """Response model for message publishing."""
    status: str
    exchange: str
    routing_key: str
    message: dict


@router.post("/message/publish", response_model=PublishMessageResponse)
def publish_message(req: PublishMessageRequest):
    """
    Publish a message directly to an exchange.
    
    Useful for:
    - Testing message routing patterns
    - Manual message injection for testing
    - Simulating order publishing without Producer API
    
    Args:
        req: PublishMessageRequest with exchange, routing_key, and message body
        
    Returns:
        PublishMessageResponse with confirmation
        
    Raises:
        HTTPException(400): Invalid exchange or routing key
        HTTPException(500): Failed to publish message
    """
    try:
        # Validate exchange name (allow empty string for AMQP default exchange)
        if req.exchange is None or not isinstance(req.exchange, str):
            raise HTTPException(
                status_code=400,
                detail="Exchange name must be a string ('' for AMQP default exchange)"
            )
        
        # Validate body
        if not isinstance(req.body, dict):
            raise HTTPException(
                status_code=400,
                detail="Message body must be a JSON object"
            )
        
        # Create connection and publish
        service = RabbitMQService()
        conn = service._conn()
        
        try:
            channel = conn.channel()
            
            # Map 'default' to empty string for AMQP default exchange
            exchange_name = '' if req.exchange == 'default' else req.exchange
            
            # Prepare message properties (include headers for headers exchange routing)
            properties = pika.BasicProperties(
                delivery_mode=2 if req.persistent else 1,
                content_type='application/json',
                headers=req.headers if req.headers else None
            )
            
            # Convert body to JSON string and encode
            message_body = json.dumps(req.body).encode('utf-8')
            
            # Publish the message
            channel.basic_publish(
                exchange=exchange_name,
                routing_key=req.routing_key or "",
                body=message_body,
                properties=properties
            )
            
            logger.info(
                f"Message published to exchange='{exchange_name}' "
                f"routing_key='{req.routing_key}' "
                f"persistent={req.persistent}"
            )
            
            return PublishMessageResponse(
                status="published",
                exchange=req.exchange,
                routing_key=req.routing_key,
                message=req.body
            )
            
        finally:
            if channel and not channel.is_closed:
                channel.close()
            if conn and conn.is_open:
                conn.close()
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to publish message: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to publish message: {str(e)}"
        )


@router.post("/message/publish-batch")
def publish_batch_messages(messages: list):
    """
    Publish multiple messages in batch.
    
    Args:
        messages: List of PublishMessageRequest objects
        
    Returns:
        Batch publishing status
    """
    try:
        if not isinstance(messages, list) or len(messages) == 0:
            raise HTTPException(
                status_code=400,
                detail="Messages must be a non-empty list"
            )
        
        service = RabbitMQService()
        conn = service._conn()
        
        published_count = 0
        failed_count = 0
        errors = []
        
        try:
            channel = conn.channel()
            
            for idx, msg_data in enumerate(messages):
                try:
                    # Parse the request
                    if isinstance(msg_data, dict):
                        req = PublishMessageRequest(**msg_data)
                    else:
                        req = msg_data
                    
                    # Prepare properties
                    properties = pika.BasicProperties(
                        delivery_mode=2 if req.persistent else 1,
                        content_type='application/json'
                    )
                    
                    # Publish
                    message_body = json.dumps(req.body).encode('utf-8')
                    channel.basic_publish(
                        exchange=req.exchange,
                        routing_key=req.routing_key or "",
                        body=message_body,
                        properties=properties
                    )
                    published_count += 1
                    
                except Exception as e:
                    failed_count += 1
                    errors.append({
                        "index": idx,
                        "error": str(e)
                    })
                    logger.error(f"Failed to publish message {idx}: {str(e)}")
            
            return {
                "status": "batch_published",
                "total": len(messages),
                "published": published_count,
                "failed": failed_count,
                "errors": errors if failed_count > 0 else None
            }
            
        finally:
            if channel and not channel.is_closed:
                channel.close()
            if conn and conn.is_open:
                conn.close()
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to publish batch: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to publish batch: {str(e)}"
        )
