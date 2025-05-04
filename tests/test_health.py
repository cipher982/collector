"""Health endpoint under stubbed DB – should still return healthy."""


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "healthy"
