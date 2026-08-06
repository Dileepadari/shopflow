"""Status and DLX history endpoints."""
from fastapi import APIRouter, Query

from chaos_service.services.docker_service import DockerService
from chaos_service.services.rabbitmq_service import RabbitMQService
from src.consumers.dead_letter_consumer import DLX_LOG_FILENAME
from src.utils.jsonl import count_records, log_path, read_records
from src.utils.logger import setup_logging

logger = setup_logging(__name__)
router = APIRouter(tags=["Status"])
docker_svc = DockerService()
rmq_svc = RabbitMQService()


def _is_consuming(container_name: str, active_tags: set[str]) -> bool:
    """Does this container hold a live subscription?

    Consumer tags are built as "<consumer_tag>@<hostname>:<pid>" and compose
    sets each consumer's hostname to its container name, so the container name
    appears verbatim between "@" and ":". The looser fallback covers a consumer
    started outside compose, where the hostname is a container id.
    """
    marker = f"@{container_name}:"
    if any(marker in tag for tag in active_tags):
        return True
    # payment_consumer_1 -> payment_consumer
    base = container_name.rsplit("_", 1)[0] if container_name[-1].isdigit() else container_name
    return any(tag.startswith(f"{base}@") for tag in active_tags)


@router.get("/status")
def get_status():
    """Container states plus cluster node health, for the dashboard."""
    try:
        services = docker_svc.get_all_status()
    except Exception as exc:
        logger.error("Error getting container status: %s", exc)
        return {"services": {}, "cluster": [], "consumers": {}, "error": str(exc)}

    active_tags = rmq_svc.get_active_consumer_tags()
    consumers: dict[str, str] = {}

    for name, info in services.items():
        if any(word in name for word in ("consumer", "processor")):
            if info["state"] != "running":
                info["connection"] = "stopped"
            else:
                info["connection"] = "consuming" if _is_consuming(name, active_tags) else "idle"
            consumers[name] = info["connection"]
        else:
            info["connection"] = info["state"]

    return {
        "services": services,
        # Exposed separately so scripts/validate.sh can assert on it directly.
        "consumers": consumers,
        "cluster": rmq_svc.get_cluster_status(),
    }


@router.get("/dlx/history")
def dlx_history(limit: int = Query(default=50, ge=1, le=500)):
    """Recent dead letter records, newest first.

    Reads only the tail and skips malformed lines: the file is appended to by
    the DLX consumer while this reads it, so a partially written final line is
    normal and must not fail the request.
    """
    path = log_path(DLX_LOG_FILENAME)
    records = read_records(path, limit=limit)
    # `total` is the whole file, not the page - returning len(records) made it
    # indistinguishable from the limit and hid how many records really exist.
    return {
        "records": list(reversed(records)),
        "returned": len(records),
        "total": count_records(path),
    }
