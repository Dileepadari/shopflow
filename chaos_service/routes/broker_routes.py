"""Broker-level chaos: stop / kill / start a RabbitMQ node."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chaos_service import containers
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Broker Chaos"])
docker_svc = DockerService()


class BrokerRequest(BaseModel):
    node: str


def _validate(node: str) -> str:
    if node not in containers.BROKER_NODES:
        raise HTTPException(
            status_code=400,
            detail=f"node must be one of {sorted(containers.BROKER_NODES)}",
        )
    return node


@router.post("/broker/stop")
def stop_broker(req: BrokerRequest):
    """Node goes offline: HAProxy reroutes and the quorum queues elect a new leader."""
    return {"action": "broker_stop", "node": _validate(req.node),
            "result": docker_svc.stop_container(req.node)}


@router.post("/broker/kill")
def kill_broker(req: BrokerRequest):
    """Sudden crash, so HA failover speed is visible on the dashboard."""
    return {"action": "broker_kill", "node": _validate(req.node),
            "result": docker_svc.kill_container(req.node)}


@router.post("/broker/start")
def start_broker(req: BrokerRequest):
    """Node rejoins the cluster and syncs its Raft log."""
    return {"action": "broker_start", "node": _validate(req.node),
            "result": docker_svc.start_container(req.node)}
