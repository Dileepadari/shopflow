"""Consumer-level chaos: stop / kill / pause / resume / start / delay."""
from fastapi import APIRouter
from pydantic import BaseModel
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Consumer Chaos"])
docker_svc = DockerService()

class ConsumerRequest(BaseModel):
    service: str

class DelayRequest(BaseModel):
    service: str
    delay_ms: int

@router.post("/consumer/stop")
def stop_consumer(req: ConsumerRequest):
    return {"action": "stop", "service": req.service,
            "result": docker_svc.stop_container(req.service)}

@router.post("/consumer/kill")
def kill_consumer(req: ConsumerRequest):
    return {"action": "kill", "service": req.service,
            "result": docker_svc.kill_container(req.service)}

@router.post("/consumer/pause")
def pause_consumer(req: ConsumerRequest):
    return {"action": "pause", "service": req.service,
            "result": docker_svc.pause_container(req.service)}

@router.post("/consumer/resume")
def resume_consumer(req: ConsumerRequest):
    return {"action": "resume", "service": req.service,
            "result": docker_svc.unpause_container(req.service)}

@router.post("/consumer/start")
def start_consumer(req: ConsumerRequest):
    return {"action": "start", "service": req.service,
            "result": docker_svc.start_container(req.service)}
