"""src.utils.logger - Consistent logging setup for all ShopFlow services."""
import logging
import sys

_CONFIGURED = False


def _resolve_level(level: int | str | None) -> int:
    if level is None:
        from src.core.config import settings
        level = settings.log_level
    if isinstance(level, str):
        return getattr(logging, level.upper(), logging.INFO)
    return level


def setup_logging(name: str, level: int | str | None = None) -> logging.Logger:
    """Return a named logger, configuring the root handler exactly once.

    Handlers live on the root logger so that modules using a plain
    ``logging.getLogger(__name__)`` - src.core.connection, src.core.declarations,
    and both FastAPI services - also produce output. Previously they had no
    handler at all and their log lines went nowhere.
    """
    global _CONFIGURED
    resolved = _resolve_level(level)

    if not _CONFIGURED:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            fmt="%(asctime)s  [%(levelname)-8s]  %(name)s  -  %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        root = logging.getLogger()
        root.handlers.clear()
        root.addHandler(handler)
        root.setLevel(resolved)
        # pika logs every frame at DEBUG, which drowns everything else.
        logging.getLogger("pika").setLevel(logging.WARNING)
        _CONFIGURED = True

    logger = logging.getLogger(name)
    logger.setLevel(resolved)
    return logger
