"""Pytest global fixtures – run without external services.

We monkey-patch the *db* module to store rows in-memory, letting integration
tests execute without PostgreSQL or Docker.  Playwright E2E tests remain
optional and can be skipped via ``--skip-e2e``.
"""

from __future__ import annotations

import socket
import threading
import time
from contextlib import contextmanager
from typing import Any
from typing import Generator
from typing import List

import pytest

# ---------------------------------------------------------------------------
# CLI option
# ---------------------------------------------------------------------------


def pytest_addoption(parser):  # noqa: D401 – pytest hook name enforced
    parser.addoption(
        "--skip-e2e",
        action="store_true",
        default=False,
        help="Skip Playwright end-to-end browser tests.",
    )


# ---------------------------------------------------------------------------
# In-memory stub for the *db* module
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def _patch_db() -> None:  # noqa: D401 – autouse fixture
    """Replace db helpers with in-memory equivalents before tests import *app*."""

    import importlib

    db = importlib.import_module("db")

    # Accumulate inserted rows here so tests can introspect.
    _records: List[dict[str, Any]] = []

    def fake_insert_debug_record(**kwargs):  # type: ignore[override]
        _records.append(kwargs)

    @contextmanager
    def fake_get_conn() -> Generator[None, None, None]:  # type: ignore[override]
        yield None

    def fake_init():  # type: ignore[override]
        pass  # no-op

    db.insert_debug_record = fake_insert_debug_record  # type: ignore[attr-defined]
    db.get_conn = fake_get_conn  # type: ignore[attr-defined]
    db.init = fake_init  # type: ignore[attr-defined]
    db._records = _records  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Flask test client
# ---------------------------------------------------------------------------


@pytest.fixture()
def client():
    from app import app as flask_app  # imported after DB patch

    return flask_app.test_client()


# ---------------------------------------------------------------------------
# Playwright fixtures (optional)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def browser(pytestconfig):
    if pytestconfig.getoption("--skip-e2e"):
        pytest.skip("E2E tests skipped via flag")

    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        pytest.skip("Playwright not installed", allow_module_level=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        yield browser
        browser.close()


@pytest.fixture(scope="session")
def _flask_server(pytestconfig):
    if pytestconfig.getoption("--skip-e2e"):
        pytest.skip("--skip-e2e flag – skipping server startup")

    from app import app as flask_app

    port = 58000

    thread = threading.Thread(
        target=lambda: flask_app.run(host="127.0.0.1", port=port, use_reloader=False),
        daemon=True,
    )
    thread.start()

    # Wait for server
    for _ in range(50):
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)
    else:
        pytest.skip("Flask dev server failed to start", allow_module_level=True)

    yield f"http://127.0.0.1:{port}"
