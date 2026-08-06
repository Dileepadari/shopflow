"""
The set of containers the Chaos Service is allowed to touch.

This is a security boundary, not just bookkeeping: the service has
/var/run/docker.sock mounted, so without an allow-list any caller could stop or
kill unrelated containers on the host - and restore_all() previously started
every exited container on the machine, including other projects'.
"""

BROKER_NODES = frozenset({"rabbit1", "rabbit2", "rabbit3"})

CONSUMERS = frozenset({
    "payment_consumer_1", "payment_consumer_2",
    "inventory_consumer_1", "inventory_consumer_2",
    "email_consumer", "sms_consumer", "push_consumer",
    "log_error_consumer", "log_info_consumer",
    "notif_email_consumer", "notif_sms_consumer", "notif_audit_consumer",
    "eu_processor", "us_processor", "xml_legacy_consumer",
    "dead_letter_consumer",
})

INFRASTRUCTURE = frozenset({
    "haproxy", "cluster_init", "chaos_service", "producer_api", "shopflow_frontend",
})

#: Everything the dashboard displays.
ALL = BROKER_NODES | CONSUMERS | INFRASTRUCTURE

#: Containers restore-all is permitted to start. The chaos service must not
#: restart itself, and cluster_init is a one-shot that is meant to stay exited.
RESTORABLE = BROKER_NODES | CONSUMERS | {"haproxy", "producer_api", "shopflow_frontend"}


def consumer_container_for(service_name: str) -> str:
    """Map a consumer tag prefix to its container name, where they differ."""
    return service_name
