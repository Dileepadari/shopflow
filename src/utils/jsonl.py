"""
src.utils.jsonl
~~~~~~~~~~~~~~~
Append-only JSONL sinks on the shared Docker volume.

Three consumers persist records this way (error logs, notification audit, dead
letters) and the chaos service reads them back. Centralised here so that the
directory is created lazily rather than at import time - the modules must stay
importable on a machine where /app/logs does not exist.
"""
import json
import threading
from pathlib import Path

from src.core.config import settings

_lock = threading.Lock()


def log_path(filename: str) -> Path:
    """Full path to a JSONL sink under the configured log directory."""
    return settings.log_dir / filename


def append_record(path: Path, record: dict) -> None:
    """Append one JSON record and flush it.

    Uses a context manager so the handle is closed rather than left to the
    garbage collector, and flushes to disk because the chaos service tails these
    files while they are being written.
    """
    line = json.dumps(record, default=str) + "\n"
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)
            fh.flush()


def count_records(path: Path) -> int:
    """Total records in the file, independent of any page size."""
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())


def read_records(path: Path, limit: int = 100) -> list[dict]:
    """Return the last ``limit`` valid records, newest last.

    Tolerates partially written trailing lines - these files are appended to by
    other containers while being read.
    """
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()
    records = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records
