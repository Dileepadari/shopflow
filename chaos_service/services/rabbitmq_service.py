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
            
            # Generate realistic messages based on queue/exchange type
            for i in range(count):
                order_id = f"FLOOD-{uuid.uuid4().hex[:8]}"
                base_msg = {
                    "order_id": order_id,
                    "flood": True,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "batch_index": i
                }
                
                # Prepare headers and message body based on exchange type
                headers = None
                
                if exchange == "" and routing_key == "payment_queue":
                    # Payment messages need amount and currency
                    msg = {**base_msg, "amount": 99.99, "currency": "USD", "customer_email": f"customer{i}@example.com"}
                elif exchange == "" and routing_key == "inventory_queue":
                    # Inventory messages need items
                    msg = {**base_msg, "items": [{"sku": "SKU-001", "qty": 5}]}
                elif exchange == "order.events":
                    # Fanout (email, sms, push)
                    msg = {**base_msg, "customer_email": f"customer{i}@example.com", "phone": "+1234567890", "amount": 99.99}
                elif exchange == "logs.error":
                    # Error logs
                    msg = {**base_msg, "level": "error", "message": f"Flood error message {i}", "service": "flood_test"}
                elif exchange == "logs.info":
                    # Info logs
                    msg = {**base_msg, "level": "info", "message": f"Flood info message {i}", "service": "flood_test"}
                elif exchange == "notifications.topic":
                    # Topic notifications
                    msg = {**base_msg, "notification_type": "email", "content": f"Notification {i}"}
                elif exchange == "orders.headers":
                    # Headers exchange - routing via AMQP headers, not routing key
                    # Alternate between EU and US regions
                    region = "EU" if i % 2 == 0 else "US"
                    msg = {**base_msg, "amount": 50.00, "region": region, "format": "json"}
                    headers = {"region": region, "format": "json"}
                else:
                    msg = base_msg
                
                # Publish with appropriate properties
                props = pika.BasicProperties(delivery_mode=2, headers=headers)
                body = json.dumps(msg).encode()
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
