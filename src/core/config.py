"""
src.core.config
~~~~~~~~~~~~~~~
Centralised settings loaded from environment variables.
Inside Docker every variable is injected by docker-compose.yml.
Outside Docker they fall back to localhost defaults.
"""
import os
from dataclasses import dataclass
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
    dlx_exchange: str
    dlx_routing_key_prefix: str

settings = Settings(
    rabbitmq_host=os.getenv("RABBITMQ_HOST", "localhost"),
    rabbitmq_port=int(os.getenv("HAPROXY_AMQP_PORT", "5670")),
    rabbitmq_user=os.getenv("RABBITMQ_USER", "admin"),
    rabbitmq_pass=os.getenv("RABBITMQ_PASS", "shopflow123"),
    rabbitmq_vhost=os.getenv("RABBITMQ_VHOST", "shopflow"),
    prefetch_count=int(os.getenv("PREFETCH_COUNT", "1")),
    max_retries=int(os.getenv("MAX_RETRIES", "3")),
    message_ttl_ms=int(os.getenv("MESSAGE_TTL_MS", "60000")),
    dlx_exchange="dead.letter.exchange",
    dlx_routing_key_prefix="dlx",
)
