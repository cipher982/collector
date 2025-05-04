"""End-to-end test: load the dashboard in a real browser, wait for collector
POST request, verify expected keys.

Requires Playwright and the external browser binaries. Skip automatically when
not available or when --skip-e2e flag is used.
"""

from __future__ import annotations

import json

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

    # Use Playwright's wait helper which is more reliable than manual poll.
    with page.expect_request("**/collect", timeout=20000) as req_info:  # 20-s ceiling
        page.goto(_flask_server)

    req = req_info.value

    # If our own route handler captured body use that (avoids double-parsing),
    # otherwise fall back to Playwright's helper.
    if "body" in payload_holder:
        payload = payload_holder["body"]
    else:
        try:
            payload = req.post_data_json  # playwright may expose as property
        except AttributeError:
            payload = None
        if not payload:
            payload = json.loads(req.post_data or "{}")

    # Keys that should always be present
    for key in [
        "browser",
        "performance",
        "fingerprints",
        "errors",
    ]:
        assert key in payload

    context.close()
