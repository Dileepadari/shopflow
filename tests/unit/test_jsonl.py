"""Tests for the append-only JSONL sinks (src.utils.jsonl)."""
import dataclasses

import pytest

from src.utils import jsonl
from src.utils.jsonl import append_record, count_records, read_records


@pytest.fixture
def sink(tmp_path, monkeypatch):
    """A sink in a temp directory, with rotation effectively disabled."""
    monkeypatch.setattr(
        jsonl, "settings",
        dataclasses.replace(jsonl.settings, log_dir=tmp_path, log_max_bytes=0),
    )
    return tmp_path / "records.jsonl"


class TestAppendAndRead:
    def test_missing_file_reads_as_empty(self, sink):
        assert read_records(sink) == []
        assert count_records(sink) == 0

    def test_roundtrip(self, sink):
        append_record(sink, {"order_id": "A", "n": 1})
        append_record(sink, {"order_id": "B", "n": 2})

        records = read_records(sink)
        assert [r["order_id"] for r in records] == ["A", "B"]
        assert count_records(sink) == 2

    def test_creates_the_directory(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            jsonl, "settings",
            dataclasses.replace(jsonl.settings, log_dir=tmp_path, log_max_bytes=0),
        )
        nested = tmp_path / "deep" / "records.jsonl"
        append_record(nested, {"ok": True})
        assert nested.exists()

    def test_limit_returns_the_newest(self, sink):
        for i in range(20):
            append_record(sink, {"n": i})
        records = read_records(sink, limit=5)
        assert [r["n"] for r in records] == [15, 16, 17, 18, 19]

    def test_count_is_independent_of_the_page_size(self, sink):
        for i in range(20):
            append_record(sink, {"n": i})
        assert len(read_records(sink, limit=5)) == 5
        assert count_records(sink) == 20

    def test_a_partially_written_line_is_skipped(self, sink):
        """The chaos service reads these while consumers are still writing."""
        append_record(sink, {"order_id": "A"})
        with sink.open("a", encoding="utf-8") as fh:
            fh.write('{"order_id": "trunc')

        records = read_records(sink)
        assert [r["order_id"] for r in records] == ["A"]

    def test_non_json_types_do_not_break_the_write(self, sink):
        from datetime import datetime

        append_record(sink, {"at": datetime(2026, 1, 1)})
        assert read_records(sink)[0]["at"].startswith("2026-01-01")


class TestRotation:
    @pytest.fixture
    def small_sink(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            jsonl, "settings",
            dataclasses.replace(jsonl.settings, log_dir=tmp_path, log_max_bytes=200),
        )
        return tmp_path / "records.jsonl"

    def test_rotates_once_the_limit_is_exceeded(self, small_sink):
        """Without this the sinks grow without bound on the shared volume."""
        for i in range(40):
            append_record(small_sink, {"n": i, "pad": "x" * 40})

        rotated = small_sink.with_suffix(small_sink.suffix + ".1")
        assert rotated.exists(), "the sink never rotated"
        assert small_sink.stat().st_size < 2000

    def test_history_survives_a_rotation(self, small_sink):
        for i in range(40):
            append_record(small_sink, {"n": i, "pad": "x" * 40})

        # Records from before the rollover must still be reachable, otherwise
        # rotation would look like data loss to the DLX audit tab.
        seen = [r["n"] for r in read_records(small_sink, limit=100)]
        assert 39 in seen
        assert len(seen) > 1
        assert count_records(small_sink) > 1

    def test_only_one_generation_is_kept(self, small_sink):
        for i in range(200):
            append_record(small_sink, {"n": i, "pad": "x" * 40})

        siblings = list(small_sink.parent.glob("records.jsonl*"))
        assert len(siblings) == 2, f"expected the sink plus one backup, got {siblings}"

    def test_zero_disables_rotation(self, sink):
        for i in range(50):
            append_record(sink, {"n": i, "pad": "x" * 100})
        assert not sink.with_suffix(sink.suffix + ".1").exists()
        assert count_records(sink) == 50
