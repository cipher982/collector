"""Pytest global fixtures."""

from __future__ import annotations

import os
import threading
import time

import pytest

# ---------------------------------------------------------------------------
# Database container (Testcontainers – optional)
# ---------------------------------------------------------------------------


try:
    from testcontainers.postgres import PostgresContainer  # type: ignore

    _HAS_TESTCONTAINERS = True
except ModuleNotFoundError:  # pragma: no cover – optional dependency
    PostgresContainer = None  # type: ignore
    _HAS_TESTCONTAINERS = False


def pytest_addoption(parser):  # noqa: D401 – pytest hook name
    """CLI options for tests."""

    parser.addoption(
        "--skip-e2e",
        action="store_true",
        default=False,
        help="Skip Playwright end-to-end tests.",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def _postgres_container(pytestconfig):  # noqa: D401 – internal fixture
    """Start a disposable Postgres container.

    If Docker or *testcontainers* is unavailable, the fixture skips tests that
    depend on the database.
    """

    if not _HAS_TESTCONTAINERS:
        pytest.skip("testcontainers-postgres not installed", allow_module_level=True)

    try:
        with PostgresContainer("postgres:15-alpine") as pg:
            yield pg
    except Exception as exc:  # pragma: no cover – environment-specific
        pytest.skip(f"Cannot start Postgres container: {exc}", allow_module_level=True)


@pytest.fixture(scope="session", autouse=True)
def _env_and_db(_postgres_container):
    """Set DB_URL env var and initialise schema."""

    from db import init as db_init

    url = _postgres_container.get_connection_url()  # type: ignore[attr-defined]
    os.environ["DB_URL"] = url

    db_init()  # builds pool & schema


# ---------------------------------------------------------------------------
# Flask app fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client():
    """Return Flask test client."""

    from app import app as flask_app

    return flask_app.test_client()


# ---------------------------------------------------------------------------
# Playwright (E2E) fixtures
# ---------------------------------------------------------------------------


def _run_flask_server(port: int) -> None:  # pragma: no cover – helper
    """Run Flask app in a thread for Playwright tests."""

    from app import app as flask_app

    flask_app.run(host="127.0.0.1", port=port, use_reloader=False)


@pytest.fixture(scope="session")
def _flask_server(pytestconfig):
    """Launch the Flask dev server in a background thread."""

    if pytestconfig.getoption("--skip-e2e"):
        pytest.skip("--skip-e2e flag enabled – skipping server startup.")

    port = 58000  # hard-coded high port
    thread = threading.Thread(target=_run_flask_server, args=(port,), daemon=True)
    thread.start()

    # simple wait loop – production code would be more robust
    for _ in range(30):
        import socket

        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)
    else:
        raise RuntimeError("Flask server did not start in time")

    yield f"http://127.0.0.1:{port}"

    # nothing to teardown – daemon thread exits with pytest


@pytest.fixture(scope="session")
def browser(pytestconfig):
    """Return Playwright browser instance."""

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
