"""Queue-level chaos: purge / poison / flood / drop-all / restore-all."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from chaos_service.services.rabbitmq_service import RabbitMQService
from chaos_service.services.docker_service import DockerService

router = APIRouter(tags=["Queue Chaos"])
rmq_svc    = RabbitMQService()
docker_svc = DockerService()

class PurgeRequest(BaseModel):
    queue: str

class PoisonRequest(BaseModel):
    queue: str
    count: int = 1

class FloodRequest(BaseModel):
    queue:   str
    count:   int = 100


# Queue to Exchange mapping - determines where each queue receives messages
QUEUE_EXCHANGE_MAP = {
    # Work queues (default exchange)
    "payment_queue":    ("", "payment_queue"),
    "inventory_queue":  ("", "inventory_queue"),
    # Fanout exchange
    "email_queue":      ("order.events", ""),
    "sms_queue":        ("order.events", ""),
    "push_queue":       ("order.events", ""),
    # Direct exchanges
    "log_error_queue":  ("logs.error", "error"),
    "log_info_queue":   ("logs.info", "info"),
    # Topic exchange
    "notif_email_queue":  ("notifications.topic", "notification.email.test"),
    "notif_sms_queue":    ("notifications.topic", "notification.sms.urgent"),
    "notif_audit_queue":  ("notifications.topic", "#"),
    # Headers exchange
    "eu_queue":         ("orders.headers", ""),
    "us_queue":         ("orders.headers", ""),
    "xml_legacy_queue": ("orders.headers", ""),
    # Dead letter queue
    "dead_letter_queue": ("", "dead_letter_queue"),
}

@router.post("/queue/purge")
def purge_queue(req: PurgeRequest):
    return {"action": "purge", "queue": req.queue,
            "result": rmq_svc.purge_queue(req.queue)}

@router.post("/queue/poison")
def inject_poison(req: PoisonRequest):
    return {"action": "poison", "queue": req.queue, "count": req.count,
            "result": rmq_svc.inject_poison_messages(req.queue, req.count)}

@router.post("/queue/flood")
def flood_queue(req: FloodRequest):
    queue_name = req.queue
    if queue_name not in QUEUE_EXCHANGE_MAP:
        return {"action": "flood", "queue": queue_name, "count": req.count,
                "result": f"Unknown queue: {queue_name}. Available: {list(QUEUE_EXCHANGE_MAP.keys())}"}
    
    exchange, routing_key = QUEUE_EXCHANGE_MAP[queue_name]
    return {"action": "flood", "queue": queue_name, "count": req.count,
            "result": rmq_svc.flood_exchange(exchange, req.count, routing_key)}

@router.post("/connections/drop-all")
def drop_all():
    return {"action": "drop_all", "result": rmq_svc.drop_all_connections()}

@router.post("/restore-all")
def restore_all():
    return {"action": "restore_all", "result": docker_svc.restore_all()}
