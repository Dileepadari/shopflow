#!/usr/bin/env python3
"""
scripts/cluster_init.py
~~~~~~~~~~~~~~~~~~~~~~~~
One-shot topology bootstrapper.

Declares every exchange, queue and binding exactly once, then exits 0. Docker
Compose runs this as the `cluster_init` service and every consumer waits on
`service_completed_successfully`, so no consumer can start before its queue
exists. Failing here is intentional and fatal: a half-declared topology would
silently drop messages.
"""
import sys

from src.core.connection import get_channel, get_connection
from src.core.declarations import EXCHANGES, QUEUES, declare_all
from src.utils.logger import setup_logging

logger = setup_logging("cluster_init")


def main() -> None:
    logger.info("Declaring ShopFlow topology: %d exchanges, %d queues (plus the DLX).",
                len(EXCHANGES), len(QUEUES))
    connection = None
    try:
        # A generous retry budget: this runs while the cluster is still forming.
        connection = get_connection(retries=20, delay=5.0)
        channel = get_channel(connection)
        declare_all(channel)
    except Exception as exc:
        logger.error("cluster_init FAILED: %s", exc)
        sys.exit(1)
    finally:
        try:
            if connection is not None and connection.is_open:
                connection.close()
        except Exception as exc:
            logger.debug("Error closing cluster_init connection: %s", exc)

    logger.info("cluster_init complete - all exchanges, queues and bindings are ready.")
    sys.exit(0)


if __name__ == "__main__":
    main()
