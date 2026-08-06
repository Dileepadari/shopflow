"""Shared pytest fixtures.

Sets LOG_DIR before anything imports src.core.config, so the modules that write
JSONL sinks stay importable outside a container.
"""
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("LOG_DIR", "/tmp/shopflow-test-logs")
os.environ.setdefault("RABBITMQ_HOST", "localhost")


@pytest.fixture
def log_dir(tmp_path, monkeypatch):
    """Point the JSONL sinks at a temporary directory for one test.

    Settings is a frozen dataclass, so swap in a modified copy rather than
    mutating it.
    """
    import dataclasses

    from src.utils import jsonl

    monkeypatch.setattr(
        jsonl, "settings", dataclasses.replace(jsonl.settings, log_dir=tmp_path)
    )
    return tmp_path


@pytest.fixture
def mock_channel():
    """A pika channel stand-in that records every call."""
    from unittest.mock import MagicMock

    return MagicMock()
