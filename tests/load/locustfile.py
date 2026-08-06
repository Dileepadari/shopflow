"""
Locust load test against the Producer API.

    pip install -r requirements-dev.txt
    locust -f tests/load/locustfile.py --host http://localhost:8090
    # then open http://localhost:8089

Headless baseline run:
    locust -f tests/load/locustfile.py --host http://localhost:8090 \
           --headless -u 10 -r 2 -t 1m
"""
import random

from locust import HttpUser, between, task


class OrderPublisher(HttpUser):
    """Simulates customers placing orders through the REST API."""

    wait_time = between(0.5, 2.0)

    @task(10)
    def publish_order(self):
        """The main path: one order fans out across all five exchange types."""
        self.client.post(
            "/orders/publish",
            json={
                "region": random.choice(["US", "EU"]),
                "format": "json",
                "amount": round(random.uniform(10, 500), 2),
            },
            name="POST /orders/publish",
        )

    @task(3)
    def publish_batch(self):
        """Batches reuse a single broker connection, so throughput is much higher."""
        self.client.post(
            "/orders/batch",
            json={"count": 5, "region": random.choice(["US", "EU"]), "format": "json"},
            name="POST /orders/batch",
        )

    @task(2)
    def flood_fanout(self):
        """Pushes straight at the fanout exchange, skipping the work queues."""
        self.client.post(
            "/orders/flood/order.events",
            json={"count": 5, "routing_key": ""},
            name="POST /orders/flood/{exchange}",
        )

    @task(1)
    def health(self):
        self.client.get("/health", name="GET /health")
