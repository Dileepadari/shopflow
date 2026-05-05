"""
producer_api.main
~~~~~~~~~~~~~~~~~~
Lightweight FastAPI that wraps the ShopFlow producers.
Replaces running producers manually from the terminal.

Endpoints:
  POST /orders/publish          - publish one order through all exchanges
  POST /orders/batch            - publish N orders
  POST /orders/flood/{exchange} - flood an exchange with N messages
  GET  /health                  - health probe

Open API docs at: http://localhost:8090/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from producer_api.routes import order_routes, mgmt_routes

app = FastAPI(
    title="ShopFlow Producer API",
    description="HTTP endpoints to publish orders through all RabbitMQ exchange types.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(order_routes.router)
app.include_router(mgmt_routes.router)

@app.get("/health")
def health():
    return {"status": "ok", "service": "producer_api"}
