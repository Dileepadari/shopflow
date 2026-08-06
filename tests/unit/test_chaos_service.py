"""
Chaos Service request handling.

Covers the allow-list that protects the mounted Docker socket, and the error
mapping - these endpoints used to return HTTP 200 with an error string in the
body, so the dashboard could not tell success from failure.
"""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from chaos_service import containers
from chaos_service.main import app
from chaos_service.routes import broker_routes, consumer_routes, queue_routes
from chaos_service.services.rabbitmq_service import ChaosError, _publish_target
from src.core import management


@pytest.fixture
def docker_svc(monkeypatch):
    svc = MagicMock()
    svc.stop_container.return_value = {"status": "success", "message": "stopped"}
    svc.kill_container.return_value = {"status": "success", "message": "killed"}
    svc.start_container.return_value = {"status": "success", "message": "started"}
    svc.pause_container.return_value = {"status": "success", "message": "paused"}
    svc.unpause_container.return_value = {"status": "success", "message": "unpaused"}
    monkeypatch.setattr(consumer_routes, "docker_svc", svc)
    monkeypatch.setattr(broker_routes, "docker_svc", svc)
    monkeypatch.setattr(queue_routes, "docker_svc", svc)
    return svc


@pytest.fixture
def rmq_svc(monkeypatch):
    svc = MagicMock()
    svc.purge_queue.return_value = "Queue purged"
    svc.inject_poison_messages.return_value = "Injected 3 poison messages"
    svc.flood_queue.return_value = "Flooded"
    monkeypatch.setattr(queue_routes, "rmq_svc", svc)
    return svc


@pytest.fixture
def client(docker_svc, rmq_svc):
    with TestClient(app) as test_client:
        yield test_client


class TestConsumerAllowList:
    """The Docker socket is mounted, so an unchecked name is a real hazard."""

    def test_known_consumer_is_accepted(self, client, docker_svc):
        response = client.post("/chaos/consumer/kill", json={"service": "payment_consumer_1"})
        assert response.status_code == 200
        docker_svc.kill_container.assert_called_once_with("payment_consumer_1")

    @pytest.mark.parametrize("service", [
        "rabbit1",                  # a broker, not a consumer
        "some_other_project_db",
        "chaos_service",            # must not kill itself
        "",
    ])
    def test_anything_else_is_rejected(self, client, docker_svc, service):
        response = client.post("/chaos/consumer/stop", json={"service": service})
        assert response.status_code == 400
        docker_svc.stop_container.assert_not_called()

    @pytest.mark.parametrize("action", ["stop", "kill", "pause", "resume", "start"])
    def test_every_action_validates(self, client, action):
        response = client.post(f"/chaos/consumer/{action}", json={"service": "not_real"})
        assert response.status_code == 400


class TestBrokerAllowList:
    def test_known_node_is_accepted(self, client):
        assert client.post("/chaos/broker/stop", json={"node": "rabbit2"}).status_code == 200

    def test_unknown_node_is_rejected(self, client):
        assert client.post("/chaos/broker/kill", json={"node": "rabbit9"}).status_code == 400

    def test_a_consumer_is_not_a_broker(self, client):
        response = client.post("/chaos/broker/stop", json={"node": "payment_consumer_1"})
        assert response.status_code == 400


class TestQueueChaos:
    def test_poison_injection(self, client, rmq_svc):
        response = client.post("/chaos/queue/poison", json={"queue": "eu_queue", "count": 3})
        assert response.status_code == 200
        rmq_svc.inject_poison_messages.assert_called_once_with("eu_queue", 3)

    def test_unknown_queue_maps_to_400_not_200(self, client, rmq_svc):
        rmq_svc.flood_queue.side_effect = ChaosError("Unknown queue 'nope'")
        response = client.post("/chaos/queue/flood", json={"queue": "nope", "count": 1})
        assert response.status_code == 400
        assert "Unknown queue" in response.json()["detail"]

    def test_broker_trouble_maps_to_502(self, client, rmq_svc):
        rmq_svc.purge_queue.side_effect = management.ManagementError("all nodes down")
        response = client.post("/chaos/queue/purge", json={"queue": "payment_queue"})
        assert response.status_code == 502

    @pytest.mark.parametrize("payload", [
        {"queue": "payment_queue", "count": 0},
        {"queue": "payment_queue", "count": 99_999},
    ])
    def test_counts_are_bounded(self, client, payload):
        assert client.post("/chaos/queue/flood", json=payload).status_code == 422


class TestPublishTarget:
    """Flood targets are derived from the topology registry, not a second map."""

    def test_work_queue_uses_the_default_exchange(self):
        assert _publish_target("payment_queue") == ("", "payment_queue", None)

    def test_fanout_queue_uses_its_exchange(self):
        exchange, key, headers = _publish_target("email_queue")
        assert exchange == "order.events"
        assert headers is None

    def test_direct_queue_uses_a_real_routing_key(self):
        assert _publish_target("log_error_queue") == ("logs.error", "error", None)

    @pytest.mark.parametrize("queue,expected", [
        ("eu_queue", {"region": "EU", "format": "json"}),
        ("us_queue", {"region": "US", "format": "json"}),
        ("xml_legacy_queue", {"format": "xml"}),
    ])
    def test_headers_queues_get_their_own_match_headers(self, queue, expected):
        """Regression: all three used to map to the same exchange with no
        headers, so flooding eu_queue split between EU and US and never once
        reached xml_legacy_queue."""
        exchange, _key, headers = _publish_target(queue)
        assert exchange == "orders.headers"
        assert headers == expected

    def test_hash_binding_is_not_used_as_a_routing_key(self):
        """# is a binding pattern, not something you can publish with."""
        _exchange, key, _headers = _publish_target("notif_audit_queue")
        assert key != "#"
        assert key.startswith("notification.")

    def test_unknown_queue_raises(self):
        with pytest.raises(ChaosError, match="Unknown queue"):
            _publish_target("not_a_queue")


class TestContainerRegistry:
    def test_restore_all_excludes_the_chaos_service_itself(self):
        assert "chaos_service" not in containers.RESTORABLE

    def test_restore_all_excludes_the_one_shot_initialiser(self):
        assert "cluster_init" not in containers.RESTORABLE

    def test_all_sixteen_consumers_are_listed(self):
        assert len(containers.CONSUMERS) == 16

    def test_broker_nodes_are_not_treated_as_consumers(self):
        assert not containers.BROKER_NODES & containers.CONSUMERS


class TestHealth:
    def test_reports_ok(self, client):
        assert client.get("/health").json()["status"] == "ok"
