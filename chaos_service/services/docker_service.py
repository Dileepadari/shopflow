"""Docker SDK wrapper for container lifecycle control."""
import docker
from docker.errors import NotFound, APIError, DockerException
import os
import logging

logger = logging.getLogger(__name__)


class DockerService:
    def __init__(self):
        # Lazy initialization - connect only when first method is called
        self._client = None
        self._docker_host = os.getenv('DOCKER_HOST', 'unix:///var/run/docker.sock')
    
    def _ensure_connected(self):
        """Lazily initialize Docker client on first use."""
        if self._client is None:
            try:
                self._client = docker.DockerClient(base_url=self._docker_host)
                logger.info(f"Connected to Docker at {self._docker_host}")
            except docker.errors.DockerException as e:
                logger.error(f"Docker connection failed: {e}")
                raise RuntimeError(f"Docker connection failed: {e}")
            except FileNotFoundError:
                logger.error(f"Docker socket not found at {self._docker_host}")
                raise RuntimeError(f"Docker socket not found at {self._docker_host}")
            except Exception as e:
                logger.error(f"Unexpected error connecting to Docker: {type(e).__name__}: {e}")
                raise RuntimeError(f"Unexpected error connecting to Docker: {type(e).__name__}: {e}")

    def _get(self, name):
        """Get container by name with error handling."""
        self._ensure_connected()
        try:
            return self._client.containers.get(name)
        except NotFound:
            logger.warning(f"Container not found: {name}")
            raise
        except APIError as e:
            logger.error(f"Docker API error getting container {name}: {e}")
            raise

    def stop_container(self, name):
        """Stop a container gracefully."""
        try: 
            self._ensure_connected()
            self._get(name).stop(timeout=10)
            logger.info(f"Container stopped: {name}")
            return {"status": "success", "message": f"{name} stopped"}
        except NotFound:
            logger.warning(f"Container not found: {name}")
            return {"status": "error", "message": f"{name} not found"}
        except APIError as e:
            logger.error(f"Failed to stop {name}: {e}")
            return {"status": "error", "message": f"Error stopping {name}: {e}"}

    def kill_container(self, name):
        """Kill a container immediately."""
        try: 
            self._ensure_connected()
            self._get(name).kill(signal="SIGKILL")
            logger.info(f"Container killed: {name}")
            return {"status": "success", "message": f"{name} killed"}
        except NotFound:
            logger.warning(f"Container not found: {name}")
            return {"status": "error", "message": f"{name} not found"}
        except APIError as e:
            logger.error(f"Failed to kill {name}: {e}")
            return {"status": "error", "message": f"Error killing {name}: {e}"}

    def start_container(self, name):
        """Start a stopped container."""
        try: 
            self._ensure_connected()
            self._get(name).start()
            logger.info(f"Container started: {name}")
            return {"status": "success", "message": f"{name} started"}
        except NotFound:
            logger.warning(f"Container not found: {name}")
            return {"status": "error", "message": f"{name} not found"}
        except APIError as e:
            logger.error(f"Failed to start {name}: {e}")
            return {"status": "error", "message": f"Error starting {name}: {e}"}

    def pause_container(self, name):
        """Pause a running container."""
        try: 
            self._ensure_connected()
            self._get(name).pause()
            logger.info(f"Container paused: {name}")
            return {"status": "success", "message": f"{name} paused"}
        except APIError as e:
            logger.error(f"Failed to pause {name}: {e}")
            return {"status": "error", "message": f"Error pausing {name}: {e}"}

    def unpause_container(self, name):
        """Unpause a paused container."""
        try:
            self._ensure_connected()
            self._get(name).unpause()
            logger.info(f"Container unpaused: {name}")
            return {"status": "success", "message": f"{name} unpaused"}
        except APIError as e:
            logger.error(f"Failed to unpause {name}: {e}")
            return {"status": "error", "message": f"Error unpausing {name}: {e}"}

    def get_all_status(self):
        """Get status of all ShopFlow containers."""
        try:
            self._ensure_connected()
            shopflow_names = {
                "rabbit1", "rabbit2", "rabbit3", "haproxy", "cluster_init",
                "chaos_service", "shopflow_frontend", "producer_api",
                "payment_consumer_1", "payment_consumer_2",
                "inventory_consumer_1", "inventory_consumer_2",
                "email_consumer", "sms_consumer", "push_consumer",
                "log_error_consumer", "log_info_consumer",
                "notif_email_consumer", "notif_sms_consumer", "notif_audit_consumer",
                "eu_processor", "us_processor", "xml_legacy_consumer", "dead_letter_consumer",
            }
            containers = self._client.containers.list(all=True)
            status_dict = {
                c.name: {"state": c.status, "image": c.image.tags[0] if c.image.tags else "unknown"}
                for c in containers if c.name in shopflow_names
            }
            logger.info(f"Retrieved status for {len(status_dict)} containers")
            return status_dict
        except Exception as e:
            logger.error(f"Failed to get container status: {e}")
            raise

    def restore_all(self):
        """Restart all stopped containers."""
        try:
            self._ensure_connected()
            stopped = [c for c in self._client.containers.list(all=True)
                      if c.status == "exited"]
            
            failed = []
            for container in stopped:
                try:
                    container.start()
                    logger.info(f"Started container: {container.name}")
                except APIError as e:
                    logger.error(f"Failed to start {container.name}: {e}")
                    failed.append(container.name)
            
            if failed:
                logger.warning(f"Failed to start {len(failed)} containers: {failed}")
            
            return {
                "status": "restored",
                "started": len(stopped) - len(failed),
                "failed": failed if failed else None,
                "total": len(stopped)
            }
        except Exception as e:
            logger.error(f"Failed to restore containers: {e}")
            raise

