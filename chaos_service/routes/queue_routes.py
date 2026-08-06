"""Queue-level chaos: purge / poison / flood / drop-all / restore-all."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from chaos_service.services.docker_service import DockerService
from chaos_service.services.rabbitmq_service import ChaosError, RabbitMQService
from src.core import management

router = APIRouter(tags=["Queue Chaos"])
rmq_svc = RabbitMQService()
docker_svc = DockerService()

MAX_FLOOD = 5000
MAX_POISON = 500


class PurgeRequest(BaseModel):
    queue: str


class PoisonRequest(BaseModel):
    queue: str
    count: int = Field(default=1, ge=1, le=MAX_POISON)


class FloodRequest(BaseModel):
    queue: str
    count: int = Field(default=100, ge=1, le=MAX_FLOOD)


def _run(fn, *args):
    """Turn chaos failures into real HTTP statuses.

    These endpoints used to return 200 with an error string in the body, so the
    dashboard could not tell success from failure.
    """
    try:
        return fn(*args)
    except ChaosError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except management.ManagementError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/queue/purge")
def purge_queue(req: PurgeRequest):
    """Drop every message in a queue."""
    return {"action": "purge", "queue": req.queue,
            "result": _run(rmq_svc.purge_queue, req.queue)}


@router.post("/queue/poison")
def inject_poison(req: PoisonRequest):
    """Inject undecodable messages, which dead-letter after their retries."""
    return {"action": "poison", "queue": req.queue, "count": req.count,
            "result": _run(rmq_svc.inject_poison_messages, req.queue, req.count)}


@router.post("/queue/flood")
def flood_queue(req: FloodRequest):
    """Overwhelm a queue to show backlog build-up and consumer catch-up."""
    return {"action": "flood", "queue": req.queue, "count": req.count,
            "result": _run(rmq_svc.flood_queue, req.queue, req.count)}


@router.post("/connections/drop-all")
def drop_all():
    """Drop every AMQP connection; consumers reconnect on their own."""
    return {"action": "drop_all", "result": _run(rmq_svc.drop_all_connections)}


@router.post("/restore-all")
def restore_all():
    """Start every stopped ShopFlow container."""
    return {"action": "restore_all", "result": docker_svc.restore_all()}
