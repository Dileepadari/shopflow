"""Docker SDK wrapper for container lifecycle control."""
import docker
from docker.errors import NotFound, APIError
import os

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
            except Exception as e:
                raise RuntimeError(f"Failed to connect to Docker: {e}")

    def _get(self, name):
        self._ensure_connected()
        return self._client.containers.get(name)

    def stop_container(self, name):
        try: 
            self._ensure_connected()
            self._get(name).stop(timeout=10)
            return f"{name} stopped"
        except NotFound: return f"{name} not found"
        except APIError as e: return f"Error: {e}"

    def kill_container(self, name):
        try: 
            self._ensure_connected()
            self._get(name).kill(signal="SIGKILL")
            return f"{name} killed"
        except NotFound: return f"{name} not found"
        except APIError as e: return f"Error: {e}"

    def start_container(self, name):
        try: 
            self._ensure_connected()
            self._get(name).start()
            return f"{name} started"
        except NotFound: return f"{name} not found"
        except APIError as e: return f"Error: {e}"

    def pause_container(self, name):
        try: 
            self._ensure_connected()
            self._get(name).pause()
            return f"{name} paused"
        except APIError as e: return f"Error: {e}"

    def unpause_container(self, name):
        try: self._get(name).unpause(); return f"{name} unpaused"
        except APIError as e: return f"Error: {e}"

    def get_all_status(self):
        shopflow_names = {
            "rabbit1","rabbit2","rabbit3","haproxy","cluster_init",
            "chaos_service","shopflow_frontend","producer_api",
            "payment_consumer_1","payment_consumer_2",
            "inventory_consumer_1","inventory_consumer_2",
            "email_consumer","sms_consumer","push_consumer",
            "log_error_consumer","log_info_consumer",
            "notif_email_consumer","notif_sms_consumer","notif_audit_consumer",
            "eu_processor","us_processor","xml_legacy_consumer","dead_letter_consumer",
        }
        containers = self._client.containers.list(all=True)
        return [{"name": c.name, "status": c.status}
                for c in containers if c.name in shopflow_names]

    def restore_all(self):
        stopped = [c for c in self._client.containers.list(all=True)
                   if c.status == "exited"]
        for c in stopped:
            try: c.start()
            except APIError: pass
        return f"Started {len(stopped)} stopped containers"
