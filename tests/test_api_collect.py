"""Integration tests for /collect endpoint."""

from __future__ import annotations

from db import get_conn
from tests.factories import sample_payload


def _row_count() -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM debug_data")
            (cnt,) = cur.fetchone()
            return cnt


def test_collect_inserts_row(client):
    before = _row_count()

    resp = client.post("/collect", json=sample_payload())
    assert resp.status_code == 200

    after = _row_count()
    assert after == before + 1
