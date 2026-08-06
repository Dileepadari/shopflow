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


def _rotate_if_needed(path: Path) -> None:
    """Roll the file over once it exceeds the configured size.

    These sinks are append-only on a shared volume and would otherwise grow
    without bound. One generation is kept as <name>.1 - enough to survive a
    rotation happening mid-investigation, without unbounded history.
    """
    limit = settings.log_max_bytes
    if limit <= 0 or not path.exists():
        return
    try:
        if path.stat().st_size < limit:
            return
        previous = path.with_suffix(path.suffix + ".1")
        previous.unlink(missing_ok=True)
        path.rename(previous)
    except OSError:
        # Rotation is best-effort: never lose the record over a housekeeping
        # failure.
        pass


def append_record(path: Path, record: dict) -> None:
    """Append one JSON record and flush it.

    Uses a context manager so the handle is closed rather than left to the
    garbage collector, and flushes to disk because the chaos service tails these
    files while they are being written.
    """
    line = json.dumps(record, default=str) + "\n"
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        _rotate_if_needed(path)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)
            fh.flush()


def _generations(path: Path) -> list[Path]:
    """The sink's files oldest first, so rotation does not hide history."""
    rotated = path.with_suffix(path.suffix + ".1")
    return [p for p in (rotated, path) if p.exists()]


def count_records(path: Path) -> int:
    """Total records across all generations, independent of any page size."""
    total = 0
    for generation in _generations(path):
        try:
            with generation.open("r", encoding="utf-8") as fh:
                total += sum(1 for line in fh if line.strip())
        except OSError:
            continue
    return total


def read_records(path: Path, limit: int = 100) -> list[dict]:
    """Return the last ``limit`` valid records, newest last.

    Tolerates partially written trailing lines - these files are appended to by
    other containers while being read - and spans the rotated generation so a
    rollover does not appear to erase recent history.
    """
    lines: list[str] = []
    for generation in _generations(path):
        try:
            with generation.open("r", encoding="utf-8") as fh:
                lines.extend(fh.readlines())
        except OSError:
            continue

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
