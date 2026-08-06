"""
chaos_service.main
~~~~~~~~~~~~~~~~~~~
Chaos Control Panel - FastAPI entrypoint.
Exposes fault-injection, status, and DLX history endpoints.

This service has /var/run/docker.sock mounted so it can start, stop, pause and
kill containers. Every container and queue name it accepts is checked against an
allow-list (chaos_service/containers.py and the topology registry), and CORS is
restricted to the dashboard origin.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from chaos_service.routes import (
    broker_routes,
    consumer_routes,
    message_routes,
    queue_routes,
    status_routes,
)

CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app = FastAPI(
    title="ShopFlow Chaos Control Panel",
    description="On-demand fault injection for demonstrating RabbitMQ's reliability guarantees.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(consumer_routes.router, prefix="/chaos")
app.include_router(broker_routes.router, prefix="/chaos")
app.include_router(queue_routes.router, prefix="/chaos")
app.include_router(message_routes.router, prefix="/chaos")
app.include_router(status_routes.router, prefix="/chaos")


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "chaos_control_panel"}
