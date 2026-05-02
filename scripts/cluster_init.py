#!/usr/bin/env python3
"""
scripts/cluster_init.py
~~~~~~~~~~~~~~~~~~~~~~~~
One-shot cluster initialisation.
Declares all exchanges, queues, and bindings, then exits 0.
Docker Compose runs this as the cluster_init service; all consumers
wait for it to complete successfully before starting.
"""
import sys
import os
import logging

sys.path.insert(0, "/app")

from src.core.connection import get_connection, get_channel
from src.core.declarations import declare_all
from src.utils.logger import setup_logging

logger = setup_logging("cluster_init")

def main():
    logger.info("ShopFlow cluster_init starting...")
    try:
        connection = get_connection(retries=20, delay=5.0)
        channel = get_channel(connection)
        declare_all(channel)
        connection.close()
        logger.info("cluster_init complete — all exchanges and queues ready.")
        sys.exit(0)   # Exit 0 so service_completed_successfully triggers
    except Exception as exc:
        logger.error("cluster_init FAILED: %s", exc)
        sys.exit(1)

if __name__ == "__main__":
    main()
