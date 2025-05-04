"""Integration test using the in-memory stubbed DB."""

from __future__ import annotations

import db  # the patched instance with _records list  # type: ignore
from tests.factories import sample_payload


def test_collect_inserts_record(client):
    before = len(db._records)  # type: ignore[attr-defined]

    resp = client.post("/collect", json=sample_payload())
    assert resp.status_code == 200

    after = len(db._records)  # type: ignore[attr-defined]
    assert after == before + 1
