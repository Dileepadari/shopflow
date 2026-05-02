"""
Locust load test — publishes orders via Producer API.
Usage:
  locust -f tests/load/locustfile.py --host http://localhost:8090
  # Open http://localhost:8089
"""
import random
from locust import HttpUser, task, between

class OrderPublisher(HttpUser):
    wait_time = between(0.5, 2.0)

    @task(10)
    def publish_order(self):
        self.client.post("/orders/publish", json={
            "region": random.choice(["US","EU"]),
            "format": "json", "amount": round(random.uniform(10,500), 2)
        }, name="POST /orders/publish")

    @task(3)
    def flood_fanout(self):
        self.client.post("/orders/flood/order.events",
                         json={"exchange":"order.events","count":5,"routing_key":""},
                         name="POST /orders/flood/fanout")

    @task(1)
    def health(self):
        self.client.get("/health", name="GET /health")
