"""RabbitMQ Management API + pika wrapper for queue chaos operations."""
import json, os, uuid, pika, httpx
from datetime import datetime, timezone

MGMT_URLS = [
    os.getenv("RABBIT1_MGMT", "http://172.20.0.11:15672"),
    os.getenv("RABBIT2_MGMT", "http://172.20.0.12:15672"),
    os.getenv("RABBIT3_MGMT", "http://172.20.0.13:15672"),
]
USER  = os.getenv("RABBITMQ_USER",  "admin")
PASS  = os.getenv("RABBITMQ_PASS",  "shopflow123")
VHOST = os.getenv("RABBITMQ_VHOST", "shopflow")
HOST  = os.getenv("RABBITMQ_HOST",  "haproxy")
PORT  = int(os.getenv("RABBITMQ_PORT", "5670"))

def _mgmt(method, path, **kw):
    for url in MGMT_URLS:
        try:
            r = getattr(httpx, method)(f"{url}/api{path}", auth=(USER,PASS),
                                       timeout=5, **kw)
            r.raise_for_status()
            return r.json() if method == "get" else True
        except Exception:
            continue
    return None

class RabbitMQService:
    def _conn(self):
        creds  = pika.PlainCredentials(USER, PASS)
        params = pika.ConnectionParameters(HOST, PORT, VHOST, creds, heartbeat=30)
        return pika.BlockingConnection(params)

    def purge_queue(self, queue):
        ok = _mgmt("delete", f"/queues/{VHOST}/{queue}/contents")
        return f"Queue {queue} purged" if ok else "Failed"

    def inject_poison_messages(self, queue, count):
        try:
            conn = self._conn(); ch = conn.channel()
            props = pika.BasicProperties(delivery_mode=2)
            for _ in range(count):
                ch.basic_publish("", queue, b"__POISON__INVALID_JSON__", props)
            conn.close()
            return f"Injected {count} poison messages into {queue}"
        except Exception as e: return f"Error: {e}"

    def flood_exchange(self, exchange, count, routing_key=""):
        try:
            conn = self._conn(); ch = conn.channel()
            props = pika.BasicProperties(delivery_mode=2)
            body = json.dumps({"order_id": str(uuid.uuid4()), "flood": True,
                               "timestamp": datetime.now(timezone.utc).isoformat()}).encode()
            for _ in range(count):
                ch.basic_publish(exchange, routing_key or "", body, props)
            conn.close()
            return f"Flooded {exchange} with {count} messages"
        except Exception as e: return f"Error: {e}"

    def drop_all_connections(self):
        data = _mgmt("get", "/connections") or []
        for c in data:
            _mgmt("delete", f"/connections/{c.get('name','')}")
        return f"Dropped {len(data)} connections"

    def get_cluster_status(self):
        data = _mgmt("get", "/nodes") or []
        return [{"name": n.get("name"), "running": n.get("running"),
                 "mem_used": n.get("mem_used"), "disk_free": n.get("disk_free")}
                for n in data]
