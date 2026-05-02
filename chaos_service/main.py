"""
chaos_service.main
~~~~~~~~~~~~~~~~~~~
Chaos Control Panel — FastAPI entrypoint.
Exposes fault-injection, status, and DLX history endpoints.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from chaos_service.routes import consumer_routes, broker_routes, queue_routes, status_routes

app = FastAPI(title="ShopFlow Chaos Control Panel", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(consumer_routes.router, prefix="/chaos")
app.include_router(broker_routes.router,   prefix="/chaos")
app.include_router(queue_routes.router,    prefix="/chaos")
app.include_router(status_routes.router,   prefix="/chaos")

@app.get("/health")
def health():
    return {"status": "ok", "service": "chaos_control_panel"}
