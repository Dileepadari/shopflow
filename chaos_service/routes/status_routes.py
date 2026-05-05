"""Status and DLX history endpoints."""
import json
import logging
from pathlib import Path
from fastapi import APIRouter, Query
from chaos_service.services.docker_service import DockerService
from chaos_service.services.rabbitmq_service import RabbitMQService, _mgmt

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Status"])
docker_svc = DockerService()
rmq_svc    = RabbitMQService()
DLX_LOG    = Path("/app/logs/dead_letters.jsonl")

@router.get("/status")
def get_status():
    try:
        # Get container states
        services = docker_svc.get_all_status()
        
        # Get actual active consumers from RabbitMQ (more reliable than connections)
        try:
            # Get list of all consumers subscribed to queues
            consumers_data = _mgmt("get", "/consumers") or []
            
            # Extract consumer tags - these are the actual subscriptions
            # Consumer format: {"queue": {"name": "payment_queue", "vhost": "/shopflow"}, "consumer_tag": "payment_consumer_12345_1714876..."}
            active_consumer_tags = set()
            for consumer in consumers_data:
                if 'consumer_tag' in consumer:
                    tag = consumer['consumer_tag']
                    # Tag format: "payment_consumer_PID_timestamp" 
                    # Extract base name (payment_consumer, inventory_consumer, etc)
                    active_consumer_tags.add(tag)
            
            # Update service status with connection state
            for service_name, service_info in services.items():
                # Consumer/processor services
                if any(keyword in service_name for keyword in ['consumer', 'processor']):
                    if service_info['state'] != 'running':
                        service_info['connection'] = 'stopped'
                    else:
                        # Check if this consumer has an active subscription by matching base name
                        # Consumer tag is like "payment_consumer_123456_1234567" and service_name is "payment_consumer"
                        is_consuming = any(
                            service_name in tag 
                            for tag in active_consumer_tags
                        )
                        service_info['connection'] = 'consuming' if is_consuming else 'idle'
                else:
                    # For broker/infra services, show state
                    service_info['connection'] = service_info['state']
        except Exception as e:
            logger.warning(f"Could not get consumer details: {e}")
            # Fallback: show container state
            for service_info in services.values():
                service_info['connection'] = service_info['state']
        
        return {
            "services": services,
            "cluster": rmq_svc.get_cluster_status()
        }
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return {"services": {}, "cluster": {}, "error": str(e)}

@router.get("/dlx/history")
def dlx_history(limit: int = Query(default=50, le=500)):
    if not DLX_LOG.exists():
        return {"records": [], "total": 0}
    lines = DLX_LOG.read_text().strip().splitlines()
    records = [json.loads(l) for l in lines[-limit:]]
    return {"records": list(reversed(records)), "total": len(lines)}
