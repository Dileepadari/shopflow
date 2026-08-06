"""
src.core.config
~~~~~~~~~~~~~~~
Centralised settings loaded from environment variables.
Inside Docker every variable is injected by docker-compose.yml.
Outside Docker they fall back to localhost defaults.
"""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    rabbitmq_host: str
    rabbitmq_port: int
    rabbitmq_user: str
    rabbitmq_pass: str
    rabbitmq_vhost: str
    prefetch_count: int
    max_retries: int
    message_ttl_ms: int
    log_dir: Path
    log_level: str
    log_max_bytes: int
    dlx_exchange: str = "dead.letter.exchange"
    dlx_routing_key_prefix: str = "dlx"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            rabbitmq_host=os.getenv("RABBITMQ_HOST", "localhost"),
            # Services connect through HAProxy. HAPROXY_AMQP_PORT is the canonical
            # name; RABBITMQ_PORT is accepted because the chaos service used to
            # read that name for the same value.
            rabbitmq_port=int(
                os.getenv("HAPROXY_AMQP_PORT") or os.getenv("RABBITMQ_PORT") or "5670"
            ),
            rabbitmq_user=os.getenv("RABBITMQ_USER", "admin"),
            rabbitmq_pass=os.getenv("RABBITMQ_PASS", "shopflow123"),
            rabbitmq_vhost=os.getenv("RABBITMQ_VHOST", "shopflow"),
            prefetch_count=int(os.getenv("PREFETCH_COUNT", "1")),
            max_retries=int(os.getenv("MAX_RETRIES", "3")),
            message_ttl_ms=int(os.getenv("MESSAGE_TTL_MS", "60000")),
            # Overridable so consumer modules stay importable outside the
            # container, where /app/logs does not exist.
            log_dir=Path(os.getenv("LOG_DIR", "/app/logs")),
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
            # Size at which a JSONL sink rolls over to <name>.1. 0 disables
            # rotation. Default 10 MiB.
            log_max_bytes=int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024))),
        )


settings = Settings.from_env()
