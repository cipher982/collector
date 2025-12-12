from __future__ import annotations

import json

import db
from tests.factories import sample_event


def test_event_inserts_one_row(client):
    db._event_records.clear()  # type: ignore[attr-defined]

    payload = sample_event()
    resp = client.post("/event", json=payload)
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}

    assert hasattr(db, "_event_records")
    assert len(db._event_records) == 1  # type: ignore[attr-defined]
    row = db._event_records[0]  # type: ignore[attr-defined]
    assert row["visitor_id"] == payload["visitor_id"]
    assert row["session_id"] == payload["session_id"]
    assert row["pageview_id"] == payload["pageview_id"]
    assert row["event_type"] == payload["event_type"]
    assert row["seq"] == payload["seq"]


def test_event_missing_required_returns_400(client):
    payload = sample_event()
    payload.pop("visitor_id")
    resp = client.post("/event", json=payload)
    assert resp.status_code == 400


def test_event_rejects_payload_over_256kb(client):
    big = sample_event()
    big["payload"] = {"blob": "x" * (300 * 1024)}

    # Use raw bytes to ensure size cap is applied to request body.
    body = json.dumps(big).encode("utf-8")
    resp = client.post("/event", data=body, content_type="application/json")
    assert resp.status_code == 413
