"""Docker SDK wrapper for container lifecycle control."""
import os

import docker
from docker.errors import APIError, NotFound

from chaos_service import containers
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

DEFAULT_SOCKET = "unix:///var/run/docker.sock"


class ContainerNotAllowed(PermissionError):
    """The requested container is not part of the ShopFlow stack."""


class DockerService:
    def __init__(self):
        # Connect lazily so the service can start before the socket is usable.
        self._client = None
        self._docker_host = self._normalize_docker_host(os.getenv("DOCKER_HOST"))

    @staticmethod
    def _normalize_docker_host(host: str | None) -> str:
        """Resolve DOCKER_HOST to something the SDK accepts.

        Docker Compose injects an `http+docker://` pseudo-scheme in some setups,
        which the SDK cannot parse; the local socket is the right answer there.
        """
        if not host or not host.strip():
            return DEFAULT_SOCKET
        host = host.strip()
        if host.startswith("http+docker://"):
            if os.path.exists("/var/run/docker.sock"):
                logger.warning("DOCKER_HOST uses the unsupported http+docker scheme; "
                               "falling back to %s", DEFAULT_SOCKET)
                return DEFAULT_SOCKET
            return host
        if host.startswith("tcp://"):
            return "http://" + host[len("tcp://"):]
        return host

    def _ensure_connected(self) -> None:
        if self._client is not None:
            return
        try:
            self._client = docker.DockerClient(base_url=self._docker_host)
            logger.info("Connected to Docker at %s", self._docker_host)
            return
        except Exception as exc:
            if self._docker_host != DEFAULT_SOCKET and os.path.exists("/var/run/docker.sock"):
                logger.warning("Docker client failed for %s (%s); retrying on %s",
                               self._docker_host, exc, DEFAULT_SOCKET)
                try:
                    self._client = docker.DockerClient(base_url=DEFAULT_SOCKET)
                    logger.info("Connected to Docker at %s", DEFAULT_SOCKET)
                    return
                except Exception as retry_exc:
                    exc = retry_exc
            logger.error("Docker connection failed: %s", exc)
            raise RuntimeError(f"Docker connection failed: {exc}") from exc

    def _get(self, name: str):
        if name not in containers.ALL:
            raise ContainerNotAllowed(
                f"{name!r} is not a ShopFlow container. "
                f"Expected one of {sorted(containers.ALL)}."
            )
        self._ensure_connected()
        return self._client.containers.get(name)

    def _action(self, name: str, verb: str, fn_name: str, **kwargs) -> dict:
        """Run one lifecycle action, reporting failures uniformly.

        Previously pause/unpause let NotFound escape as a 500 while stop/kill/start
        returned a friendly error dict for the same condition.
        """
        try:
            getattr(self._get(name), fn_name)(**kwargs)
        except NotFound:
            logger.warning("Container not found: %s", name)
            return {"status": "error", "message": f"{name} not found"}
        except APIError as exc:
            logger.error("Failed to %s %s: %s", verb, name, exc)
            return {"status": "error", "message": f"Error during {verb} of {name}: {exc}"}
        logger.info("Container %s: %s", verb, name)
        return {"status": "success", "message": f"{name} {verb}"}

    def stop_container(self, name: str) -> dict:
        return self._action(name, "stopped", "stop", timeout=10)

    def kill_container(self, name: str) -> dict:
        return self._action(name, "killed", "kill", signal="SIGKILL")

    def start_container(self, name: str) -> dict:
        return self._action(name, "started", "start")

    def pause_container(self, name: str) -> dict:
        return self._action(name, "paused", "pause")

    def unpause_container(self, name: str) -> dict:
        return self._action(name, "unpaused", "unpause")

    def get_all_status(self) -> dict:
        self._ensure_connected()
        status = {
            c.name: {
                "state": c.status,
                "image": c.image.tags[0] if c.image.tags else "unknown",
            }
            for c in self._client.containers.list(all=True)
            if c.name in containers.ALL
        }
        logger.info("Retrieved status for %d containers", len(status))
        return status

    def restore_all(self) -> dict:
        """Start every stopped ShopFlow container.

        Scoped to the allow-list: this used to start every exited container on
        the host, including ones belonging to other projects.
        """
        self._ensure_connected()
        stopped = [
            c for c in self._client.containers.list(all=True)
            if c.status == "exited" and c.name in containers.RESTORABLE
        ]
        failed = []
        for container in stopped:
            try:
                container.start()
                logger.info("Started container: %s", container.name)
            except APIError as exc:
                logger.error("Failed to start %s: %s", container.name, exc)
                failed.append(container.name)
        return {
            "status": "restored",
            "started": len(stopped) - len(failed),
            "failed": failed or None,
            "total": len(stopped),
        }
