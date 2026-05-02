"""Queue-level chaos: purge / poison / flood / drop-all / restore-all."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from chaos_service.services.rabbitmq_service import RabbitMQService
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Queue Chaos"])
rmq_svc    = RabbitMQService()
docker_svc = DockerService()

class PurgeRequest(BaseModel):
    queue: str

class PoisonRequest(BaseModel):
    queue: str
    count: int = 1

class FloodRequest(BaseModel):
    exchange:    str
    count:       int = 100
    routing_key: Optional[str] = ""

@router.post("/queue/purge")
def purge_queue(req: PurgeRequest):
    return {"action": "purge", "queue": req.queue,
            "result": rmq_svc.purge_queue(req.queue)}

@router.post("/queue/poison")
def inject_poison(req: PoisonRequest):
    return {"action": "poison", "queue": req.queue, "count": req.count,
            "result": rmq_svc.inject_poison_messages(req.queue, req.count)}

@router.post("/queue/flood")
def flood_queue(req: FloodRequest):
    return {"action": "flood", "exchange": req.exchange, "count": req.count,
            "result": rmq_svc.flood_exchange(req.exchange, req.count, req.routing_key)}

@router.post("/connections/drop-all")
def drop_all():
    return {"action": "drop_all", "result": rmq_svc.drop_all_connections()}

@router.post("/restore-all")
def restore_all():
    return {"action": "restore_all", "result": docker_svc.restore_all()}
