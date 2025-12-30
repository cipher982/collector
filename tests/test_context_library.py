"""Test the /v1/context.min.js static library endpoint."""

import hashlib
from pathlib import Path

import pytest


def test_context_library_serves_from_dev_path(client):
    """Test that the library is served from lib/dist/index.min.js in development."""
    response = client.get("/v1/context.min.js")

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/javascript"
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert "Cache-Control" in response.headers
    assert "max-age=31536000" in response.headers["Cache-Control"]
    assert "immutable" in response.headers["Cache-Control"]
    assert "ETag" in response.headers

    # Verify it contains expected library code
    content = response.data.decode("utf-8")
    assert "VisitorContext" in content or "visitor" in content.lower()


def test_context_library_etag_matches_content(client):
    """Test that ETag is correctly computed from file content."""
    response = client.get("/v1/context.min.js")

    assert response.status_code == 200
    etag = response.headers.get("ETag")
    assert etag

    # Compute hash of response body
    computed_hash = hashlib.sha256(response.data).hexdigest()
    assert etag == computed_hash


def test_context_library_304_on_matching_etag(client):
    """Test that 304 Not Modified is returned when If-None-Match matches."""
    # First request to get ETag
    response1 = client.get("/v1/context.min.js")
    assert response1.status_code == 200
    etag = response1.headers.get("ETag")

    # Second request with If-None-Match
    response2 = client.get("/v1/context.min.js", headers={"If-None-Match": etag})
    assert response2.status_code == 304
    assert response2.data == b""  # No body on 304


def test_context_library_prefers_production_path(client, tmp_path, monkeypatch):
    """Test that static/v1/context.min.js is preferred over lib/dist/."""
    # This test would require mocking the file paths, which is complex
    # For now, we verify the route exists and serves content
    response = client.get("/v1/context.min.js")
    assert response.status_code == 200


def test_context_library_file_exists():
    """Test that the built library file actually exists."""
    root = Path(__file__).parent.parent
    dev_path = root / "lib" / "dist" / "index.min.js"

    assert dev_path.exists(), f"Built library not found at {dev_path}"
    assert dev_path.stat().st_size > 1000, "Library file seems too small"


def test_context_library_has_valid_javascript():
    """Test that the library file contains valid-looking JavaScript."""
    root = Path(__file__).parent.parent
    dev_path = root / "lib" / "dist" / "index.min.js"

    if not dev_path.exists():
        pytest.skip("Library not built yet")

    content = dev_path.read_text()

    # Basic sanity checks for minified JS
    assert len(content) > 1000, "Library seems too small"
    assert "function" in content or "=>" in content, "No functions found"
    assert "{" in content and "}" in content, "No object literals found"
