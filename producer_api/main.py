"""
producer_api.main
~~~~~~~~~~~~~~~~~~
FastAPI service that wraps the ShopFlow producers, so the dashboard and the
chaos scripts can publish orders over HTTP instead of exec-ing Python inside
containers.

Endpoints:
  POST /orders/publish          - publish one order through all exchanges
  POST /orders/batch            - publish N orders
  POST /orders/flood/{exchange} - flood an exchange with N messages
  GET  /mgmt/*                  - read-only RabbitMQ Management API proxy
  GET  /health                  - health probe

Open API docs at: http://localhost:8090/docs
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from producer_api import broker
from producer_api.routes import mgmt_routes, order_routes
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

#: The dashboard is served same-origin through nginx, so no cross-origin access
#: is needed in the default deployment. Widen deliberately via CORS_ORIGINS.
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    broker.connect()
    yield
    broker.close()


app = FastAPI(
    title="ShopFlow Producer API",
    description="HTTP endpoints to publish orders through all RabbitMQ exchange types.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(order_routes.router)
app.include_router(mgmt_routes.router)


@app.get("/health", tags=["Health"])
def health():
    """Liveness probe. Reports broker connectivity without failing the check -
    the service is up even while RabbitMQ is still starting."""
    return {
        "status": "ok",
        "service": "producer_api",
        "broker_connected": broker.is_connected(),
    }
