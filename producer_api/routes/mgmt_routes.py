"""
RabbitMQ Management API Proxy Routes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Proxy endpoints to the RabbitMQ Management API to work around CORS restrictions.
The frontend can call these endpoints instead of directly accessing RabbitMQ.

All endpoints forward to the RabbitMQ Management API with proper authentication.
"""
from fastapi import APIRouter, HTTPException
from typing import Any
import base64
import os
import json
import urllib.request
import urllib.error
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mgmt", tags=["rabbitmq-management"])

# Use rabbit1 directly for Management API (not HAProxy which only handles AMQP)
RABBITMQ_MGMT_HOST = os.getenv("RABBITMQ_MGMT_HOST", "rabbit1")
RABBITMQ_MGMT_PORT = 15672
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "admin")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "shopflow123")
VHOST = os.getenv("RABBITMQ_VHOST", "shopflow")

BASE_URL = f"http://{RABBITMQ_MGMT_HOST}:{RABBITMQ_MGMT_PORT}/api"
AUTH = base64.b64encode(f"{RABBITMQ_USER}:{RABBITMQ_PASS}".encode()).decode()


def proxy_get(path: str) -> Any:
    """Helper to proxy GET requests to RabbitMQ Management API"""
    url = f"{BASE_URL}{path}"
    try:
        logger.info(f"Proxying GET {url}")
        request = urllib.request.Request(url)
        request.add_header("Authorization", f"Basic {AUTH}")
        request.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode())
            logger.info(f"Got response from {url}: {len(str(data))} bytes")
            return data
    except urllib.error.HTTPError as e:
        logger.error(f"RabbitMQ API HTTP error {e.code}: {e.reason}")
        raise HTTPException(status_code=502, detail=f"RabbitMQ API returned {e.code}")
    except urllib.error.URLError as e:
        logger.error(f"Connection error to {RABBITMQ_MGMT_HOST}:{RABBITMQ_MGMT_PORT}: {e.reason}")
        raise HTTPException(status_code=502, detail=f"Cannot reach RabbitMQ: {str(e.reason)}")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON response: {e}")
        raise HTTPException(status_code=502, detail="Invalid response from RabbitMQ")
    except Exception as e:
        logger.error(f"Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"Error: {str(e)}")


@router.get("/nodes")
def get_nodes():
    """GET /api/nodes — Cluster node information"""
    return proxy_get("/nodes")


@router.get("/overview")
def get_overview():
    """GET /api/overview — System-wide statistics"""
    return proxy_get("/overview")


@router.get("/queues/{vhost}")
def get_queues(vhost: str = VHOST):
    """GET /api/queues/{vhost} — All queues in a virtual host"""
    return proxy_get(f"/queues/{vhost}")


@router.get("/exchanges/{vhost}")
def get_exchanges(vhost: str = VHOST):
    """GET /api/exchanges/{vhost} — All exchanges in a virtual host"""
    return proxy_get(f"/exchanges/{vhost}")


@router.get("/consumers/{vhost}")
def get_consumers(vhost: str = VHOST):
    """GET /api/consumers/{vhost} — All consumers in a virtual host"""
    return proxy_get(f"/consumers/{vhost}")


@router.get("/connections")
def get_connections():
    """GET /api/connections — All active connections"""
    return proxy_get("/connections")


@router.get("/bindings/{vhost}")
def get_bindings(vhost: str = VHOST):
    """GET /api/bindings/{vhost} — All bindings in a virtual host"""
    return proxy_get(f"/bindings/{vhost}")
