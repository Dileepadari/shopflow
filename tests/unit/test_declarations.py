"""
Topology declaration tests.

The regression guard here is test_every_queue_dead_letter_key_is_bound: the DLX
bind list used to be maintained by hand alongside the queue declarations, drifted
from them, and silently discarded dead letters for five of the queues.
"""
import pytest

from src.core.config import settings
from src.core.declarations import (
    DLX_QUEUE,
    EXCHANGES,
    QUEUES,
    QUEUES_BY_NAME,
    declare_all,
    dlx_routing_key,
)


@pytest.fixture
def declared(mock_channel):
    declare_all(mock_channel)
    return mock_channel


def queue_declares(channel):
    return {c.kwargs["queue"]: c.kwargs for c in channel.queue_declare.call_args_list}


def queue_binds(channel):
    return [c.kwargs for c in channel.queue_bind.call_args_list]


def test_declares_every_exchange_plus_the_dlx(declared):
    declared_names = {c.kwargs["exchange"] for c in declared.exchange_declare.call_args_list}
    assert declared_names == set(EXCHANGES) | {settings.dlx_exchange}


def test_all_exchanges_are_durable(declared):
    for call in declared.exchange_declare.call_args_list:
        assert call.kwargs["durable"] is True, call.kwargs["exchange"]


def test_declares_every_queue_plus_the_dlx_queue(declared):
    assert set(queue_declares(declared)) == {q.name for q in QUEUES} | {DLX_QUEUE}


def test_every_queue_is_durable_and_quorum(declared):
    for name, kwargs in queue_declares(declared).items():
        assert kwargs["durable"] is True, name
        assert kwargs["arguments"]["x-queue-type"] == "quorum", name


def test_every_queue_dead_letter_key_is_bound(declared):
    """Each work queue's x-dead-letter-routing-key must have a matching bind.

    dead.letter.exchange is a direct exchange, so an unbound routing key means
    the broker discards the dead letter with no error anywhere.
    """
    dlx_bound_keys = {
        b["routing_key"]
        for b in queue_binds(declared)
        if b["queue"] == DLX_QUEUE and b["exchange"] == settings.dlx_exchange
    }

    unbound = []
    for name, kwargs in queue_declares(declared).items():
        key = kwargs["arguments"].get("x-dead-letter-routing-key")
        if key and key not in dlx_bound_keys:
            unbound.append((name, key))

    assert not unbound, f"dead letters from these queues would vanish: {unbound}"


@pytest.mark.parametrize("spec", QUEUES, ids=lambda s: s.name)
def test_work_queue_dead_letters_to_the_dlx(declared, spec):
    args = queue_declares(declared)[spec.name]["arguments"]
    assert args["x-dead-letter-exchange"] == settings.dlx_exchange
    assert args["x-dead-letter-routing-key"] == dlx_routing_key(spec.name)
    assert args["x-message-ttl"] == settings.message_ttl_ms


def test_dead_letter_queue_has_no_ttl_and_no_onward_dlx(declared):
    """Dead letters are kept until reviewed and have nowhere further to go."""
    args = queue_declares(declared)[DLX_QUEUE]["arguments"]
    assert "x-message-ttl" not in args
    assert "x-dead-letter-exchange" not in args


def test_queues_are_bound_to_their_exchange(declared):
    binds = {(b["queue"], b["exchange"], b["routing_key"]) for b in queue_binds(declared)}
    for spec in QUEUES:
        if spec.exchange is None:
            continue
        for key in spec.routing_keys:
            assert (spec.name, spec.exchange, key) in binds


def test_default_exchange_queues_have_no_binding(declared):
    """payment_queue and inventory_queue are reached by queue name."""
    bound_queues = {b["queue"] for b in queue_binds(declared) if b["exchange"] in EXCHANGES}
    for spec in QUEUES:
        if spec.exchange is None:
            assert spec.name not in bound_queues


def test_headers_bindings_carry_match_arguments(declared):
    headers_binds = {
        b["queue"]: b["arguments"]
        for b in queue_binds(declared)
        if b["exchange"] == "orders.headers"
    }
    assert headers_binds["eu_queue"] == {"x-match": "all", "region": "EU", "format": "json"}
    assert headers_binds["us_queue"] == {"x-match": "all", "region": "US", "format": "json"}
    assert headers_binds["xml_legacy_queue"] == {"x-match": "any", "format": "xml"}


def test_declare_all_is_idempotent(mock_channel):
    """Consumers and cluster_init may both call it; a second run must match."""
    declare_all(mock_channel)
    first = len(mock_channel.queue_declare.call_args_list)
    declare_all(mock_channel)
    assert len(mock_channel.queue_declare.call_args_list) == first * 2
    assert queue_declares(mock_channel).keys() == {q.name for q in QUEUES} | {DLX_QUEUE}


def test_registry_lookup_matches_the_queue_list():
    assert set(QUEUES_BY_NAME) == {q.name for q in QUEUES}
