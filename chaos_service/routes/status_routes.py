"""Status and DLX history endpoints."""
import json
import logging
from pathlib import Path
from fastapi import APIRouter, Query
from chaos_service.services.docker_service import DockerService
from chaos_service.services.rabbitmq_service import RabbitMQService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Status"])
docker_svc = DockerService()
rmq_svc    = RabbitMQService()
DLX_LOG    = Path("/app/logs/dead_letters.jsonl")

@router.get("/status")
def get_status():
    try:
        return {
            "services": docker_svc.get_all_status(),
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
