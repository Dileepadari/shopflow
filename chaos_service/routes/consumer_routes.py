"""Consumer-level chaos: stop / kill / pause / resume / start."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chaos_service import containers
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Consumer Chaos"])
docker_svc = DockerService()


class ConsumerRequest(BaseModel):
    service: str


def _validate(service: str) -> str:
    """Reject anything outside the consumer allow-list.

    This service has the Docker socket mounted, so an unvalidated container name
    is a way to stop or kill arbitrary containers on the host.
    """
    if service not in containers.CONSUMERS:
        raise HTTPException(
            status_code=400,
            detail=f"service must be one of {sorted(containers.CONSUMERS)}",
        )
    return service


@router.post("/consumer/stop")
def stop_consumer(req: ConsumerRequest):
    """Graceful stop: the consumer reconnects on restart and drains the backlog."""
    return {"action": "stop", "service": _validate(req.service),
            "result": docker_svc.stop_container(req.service)}


@router.post("/consumer/kill")
def kill_consumer(req: ConsumerRequest):
    """SIGKILL: unACKed messages are requeued the moment the TCP connection drops."""
    return {"action": "kill", "service": _validate(req.service),
            "result": docker_svc.kill_container(req.service)}


@router.post("/consumer/pause")
def pause_consumer(req: ConsumerRequest):
    """Freeze the process: the connection stays alive but nothing is processed."""
    return {"action": "pause", "service": _validate(req.service),
            "result": docker_svc.pause_container(req.service)}


@router.post("/consumer/resume")
def resume_consumer(req: ConsumerRequest):
    return {"action": "resume", "service": _validate(req.service),
            "result": docker_svc.unpause_container(req.service)}


@router.post("/consumer/start")
def start_consumer(req: ConsumerRequest):
    return {"action": "start", "service": _validate(req.service),
            "result": docker_svc.start_container(req.service)}
