"""
src.core.management
~~~~~~~~~~~~~~~~~~~~
Client for the RabbitMQ HTTP Management API.

Shared by the Producer API (which proxies it to the dashboard) and the Chaos
Service (which uses it to purge queues and drop connections). Previously each
had its own implementation - one on urllib with hardcoded container IPs, one on
httpx with env config - which disagreed about failover and URL encoding.

HAProxy fronts AMQP only, so management calls address the nodes directly and
fail over between them.
"""
import os
from typing import Any
from urllib.parse import quote

import httpx

from src.core.config import settings
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

DEFAULT_TIMEOUT = 10.0


class ManagementError(RuntimeError):
    """No cluster node could satisfy the request."""


def _node_urls() -> list[str]:
    """Management URLs for each node, overridable per node via the environment."""
    configured = os.getenv("RABBITMQ_MGMT_URLS")
    if configured:
        return [u.strip() for u in configured.split(",") if u.strip()]
    return [
        os.getenv("RABBIT1_MGMT", "http://rabbit1:15672"),
        os.getenv("RABBIT2_MGMT", "http://rabbit2:15672"),
        os.getenv("RABBIT3_MGMT", "http://rabbit3:15672"),
    ]


def encode_vhost(vhost: str | None = None) -> str:
    """Percent-encode a vhost for use in a path segment.

    The default vhost is "/" and must be sent as %2F.
    """
    return quote(vhost if vhost is not None else settings.rabbitmq_vhost, safe="")


def request(method: str, path: str, **kwargs: Any) -> Any:
    """Call the management API, trying each node until one answers.

    Unlike the previous implementation, an HTTP error from one node does not end
    the attempt - a single node returning 503 during a restart must not take the
    dashboard down while the other two are healthy.
    """
    auth = (settings.rabbitmq_user, settings.rabbitmq_pass)
    errors: list[str] = []

    for base_url in _node_urls():
        url = f"{base_url.rstrip('/')}/api{path}"
        try:
            response = httpx.request(method, url, auth=auth,
                                     timeout=DEFAULT_TIMEOUT, **kwargs)
            response.raise_for_status()
            if not response.content:
                return None
            return response.json()
        except httpx.HTTPStatusError as exc:
            # 4xx is a genuine answer about the request, not a sick node.
            if 400 <= exc.response.status_code < 500:
                raise ManagementError(
                    f"RabbitMQ management API returned "
                    f"{exc.response.status_code} for {method} {path}"
                ) from exc
            errors.append(f"{base_url}: HTTP {exc.response.status_code}")
        except (httpx.HTTPError, ValueError) as exc:
            errors.append(f"{base_url}: {exc}")

    detail = "; ".join(errors) or "no management URLs configured"
    logger.error("All RabbitMQ management endpoints failed for %s %s: %s",
                 method, path, detail)
    raise ManagementError(f"Cannot reach RabbitMQ management API ({detail})")


def get(path: str) -> Any:
    return request("GET", path)


def delete(path: str) -> Any:
    return request("DELETE", path)


# ------------------------------------------------------------------ shortcuts

def overview() -> Any:
    return get("/overview")


def nodes() -> Any:
    return get("/nodes")


def queues(vhost: str | None = None) -> Any:
    return get(f"/queues/{encode_vhost(vhost)}")


def exchanges(vhost: str | None = None) -> Any:
    return get(f"/exchanges/{encode_vhost(vhost)}")


def consumers(vhost: str | None = None) -> Any:
    return get(f"/consumers/{encode_vhost(vhost)}")


def bindings(vhost: str | None = None) -> Any:
    return get(f"/bindings/{encode_vhost(vhost)}")


def connections() -> Any:
    return get("/connections")


def purge_queue(queue: str, vhost: str | None = None) -> None:
    delete(f"/queues/{encode_vhost(vhost)}/{quote(queue, safe='')}/contents")


def close_connection(name: str) -> None:
    """Close one connection.

    Connection names look like "172.20.0.50:41234 -> 172.20.0.11:5672" and
    contain spaces, ">" and ":", all of which must be percent-encoded. They were
    not, so every delete silently failed while the endpoint reported success.
    """
    delete(f"/connections/{quote(name, safe='')}")
