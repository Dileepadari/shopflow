"""
RabbitMQ Management API Proxy Routes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Proxy endpoints to the RabbitMQ Management API so the dashboard does not have to
call the broker directly (and hit CORS and credential problems doing so).

All forwarding, authentication and node failover lives in src.core.management,
which the Chaos Service shares.
"""
from typing import Any

from fastapi import APIRouter, HTTPException

from src.core import management

router = APIRouter(prefix="/mgmt", tags=["rabbitmq-management"])


def _proxy(fn, *args) -> Any:
    try:
        return fn(*args)
    except management.ManagementError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/nodes")
def get_nodes():
    """Cluster node information."""
    return _proxy(management.nodes)


@router.get("/overview")
def get_overview():
    """System-wide statistics, including publish/ack rates."""
    return _proxy(management.overview)


@router.get("/queues/{vhost}")
def get_queues(vhost: str):
    """All queues in a virtual host."""
    return _proxy(management.queues, vhost)


@router.get("/exchanges/{vhost}")
def get_exchanges(vhost: str):
    """All exchanges in a virtual host."""
    return _proxy(management.exchanges, vhost)


@router.get("/consumers/{vhost}")
def get_consumers(vhost: str):
    """All consumers in a virtual host."""
    return _proxy(management.consumers, vhost)


@router.get("/connections")
def get_connections():
    """All active connections."""
    return _proxy(management.connections)


@router.get("/bindings/{vhost}")
def get_bindings(vhost: str):
    """All bindings in a virtual host."""
    return _proxy(management.bindings, vhost)
