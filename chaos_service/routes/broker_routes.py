"""Broker-level chaos: stop / kill / start a RabbitMQ node."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Broker Chaos"])
docker_svc = DockerService()
VALID_NODES = {"rabbit1", "rabbit2", "rabbit3"}

class BrokerRequest(BaseModel):
    node: str

@router.post("/broker/stop")
def stop_broker(req: BrokerRequest):
    if req.node not in VALID_NODES:
        raise HTTPException(400, f"node must be one of {VALID_NODES}")
    return {"action": "broker_stop", "node": req.node,
            "result": docker_svc.stop_container(req.node)}

@router.post("/broker/kill")
def kill_broker(req: BrokerRequest):
    if req.node not in VALID_NODES:
        raise HTTPException(400, f"node must be one of {VALID_NODES}")
    return {"action": "broker_kill", "node": req.node,
            "result": docker_svc.kill_container(req.node)}

@router.post("/broker/start")
def start_broker(req: BrokerRequest):
    if req.node not in VALID_NODES:
        raise HTTPException(400, f"node must be one of {VALID_NODES}")
    return {"action": "broker_start", "node": req.node,
            "result": docker_svc.start_container(req.node)}
