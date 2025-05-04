"""End-to-end test: load the dashboard in a real browser, wait for collector
POST request, verify expected keys.

Requires Playwright and the external browser binaries. Skip automatically when
not available or when --skip-e2e flag is used.
"""

from __future__ import annotations

import json
import time

import pytest

pytestmark = pytest.mark.e2e


def test_capture_roundtrip(_flask_server, browser):
    """Ensure that the client JS posts data that contains core keys."""

    from playwright.sync_api import Request  # type: ignore
    from playwright.sync_api import Route  # type: ignore

    # ------------------------------------------------------------------
    # Intercept /collect POSTs and capture the first payload
    # ------------------------------------------------------------------

    payload_holder = {}

    def _handle(route: Route, request: Request):  # noqa: D401
        if request.method == "POST" and request.url.endswith("/collect"):
            payload_holder["body"] = json.loads(request.post_data or "{}")
        route.fulfill(status=200, body="{}", content_type="application/json")

    context = browser.new_context()
    page = context.new_page()
    page.route("**/collect", _handle)

    page.goto(_flask_server)

    # Wait up to 6 seconds for collector to fire (CONFIG.COLLECTION_DELAY = 3s)
    for _ in range(60):
        if payload_holder:
            break
        time.sleep(0.1)
    else:
        pytest.fail("No /collect request captured")

    payload = payload_holder["body"]

    # Keys that should always be present
    for key in [
        "browser",
        "performance",
        "fingerprints",
        "errors",
    ]:
        assert key in payload

    context.close()
