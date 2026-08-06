"""
producer_api.broker
~~~~~~~~~~~~~~~~~~~~
A single long-lived AMQP connection shared by every request.

Previously each published order opened a TCP connection, redeclared the entire
topology (7 exchanges, 14 queues, ~20 bindings), published, and closed - so
POST /orders/batch {"count": 100} did all of that a hundred times, with a
connection retry budget long enough to hang the request for over a minute.

pika's BlockingConnection is not thread-safe and FastAPI runs `def` endpoints in
a threadpool, so access is serialised behind a lock. For a demonstration system
the lock is cheaper than the connection churn it replaces; a higher-throughput
service would want a channel pool instead.
"""
import threading
from contextlib import contextmanager

import pika

from src.core.connection import REQUEST_RETRIES, get_channel, get_connection
from src.utils.logger import setup_logging

logger = setup_logging(__name__)

_lock = threading.Lock()
_connection: pika.BlockingConnection | None = None
_channel = None


def _open() -> None:
    global _connection, _channel
    _connection = get_connection(retries=REQUEST_RETRIES, delay=2.0)
    _channel = get_channel(_connection)
    # Publisher confirms: makes basic_publish synchronous and checkable, which is
    # what lets order_producer guarantee payment is queued before inventory.
    _channel.confirm_delivery()
    logger.info("Producer API broker channel established.")


def _healthy() -> bool:
    return (
        _connection is not None and _connection.is_open
        and _channel is not None and _channel.is_open
    )


@contextmanager
def publishing_channel():
    """Yield the shared confirm-mode channel, reconnecting if it has dropped."""
    global _connection, _channel
    with _lock:
        if not _healthy():
            _close_locked()
            _open()
        try:
            yield _channel
        except Exception:
            # The channel is likely unusable now; drop it so the next request
            # reconnects rather than reusing a dead one.
            _close_locked()
            raise


def _close_locked() -> None:
    global _connection, _channel
    for closeable in (_channel, _connection):
        try:
            if closeable is not None and not closeable.is_closed:
                closeable.close()
        except Exception as exc:
            logger.debug("Error closing broker resource: %s", exc)
    _channel = None
    _connection = None


def connect() -> None:
    """Open the shared connection at startup. Failures are not fatal - the first
    request will retry - so the API can still serve /health while the broker
    finishes starting."""
    with _lock:
        try:
            if not _healthy():
                _open()
        except Exception as exc:
            logger.warning("Broker not ready at startup (%s); will retry per request.", exc)


def close() -> None:
    with _lock:
        _close_locked()


def is_connected() -> bool:
    with _lock:
        return _healthy()
