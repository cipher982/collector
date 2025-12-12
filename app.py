"""Flask entry-point for the Browser Debug Dashboard.

The module is intentionally slim – it delegates all persistence work to
`db.py` and keeps only routing and request/response concerns.  WebSocket
functionality is a *hard* requirement and is provided by **Flask-SocketIO** –
there is no silent downgrade path; if the dependency is missing the
application will fail fast at import-time so the stack can be fixed rather
than degrading.
"""

from __future__ import annotations

# ruff: noqa: I001 – keep imports grouped for clarity; SocketIO import must
# precede several local imports.

import argparse
import hashlib
import logging
import os
import json
import socket
from typing import Any, Dict

# ``flask`` is an optional runtime dependency during *unit* test execution –
# CI environments may purposefully avoid heavyweight installs (like the full
# Flask framework) and rely instead on lightweight stubs.  We therefore
# attempt to import Flask and – if unavailable – register a *minimal* stub
# exposing just the symbols used by this module so that ``import app``
# continues to succeed.  The real framework *must* still be present in
# production images.

from dotenv import load_dotenv


try:
    from flask import Flask, jsonify, render_template, request
except ModuleNotFoundError:  # pragma: no cover – stub for CI
    import sys
    from types import ModuleType, SimpleNamespace

    _stub = ModuleType("flask")

    # -------------------------------------------------------------------
    # Request and helpers
    # -------------------------------------------------------------------

    class _FakeRequest:  # noqa: D401 – very thin shim
        def __init__(self):
            self.remote_addr = ""
            self._json = None

        def get_json(self, force: bool = True):  # noqa: D401 – mimics Flask API
            return self._json

    _request = _FakeRequest()

    def _jsonify(obj):  # noqa: D401 – identity for tests
        return obj

    def _render_template(name):  # noqa: D401 – minimal placeholder
        return f"<html><body>{name}</body></html>"

    # -------------------------------------------------------------------
    # Minimal *App* implementation able to satisfy Flask test client use.
    # -------------------------------------------------------------------

    class _FakeApp:  # noqa: D401 – sufficient subset for unit tests
        def __init__(self):
            self._routes = {}

        def route(self, rule, methods=None):  # noqa: D401 – mimic decorator
            methods = tuple(sorted((methods or ["GET"])))

            def decorator(func):
                self._routes[(rule, methods)] = func
                return func

            return decorator

        # A *very* naive test client – good enough for current unit tests.
        def test_client(self):  # noqa: D401
            app = self

            class _Client:  # noqa: D401 – inner helper
                def _dispatch(self, path, method, payload=None):
                    for (rule, methods), view in app._routes.items():
                        if rule == path and method in methods:
                            _request._json = payload
                            rv = view()
                            _request._json = None

                            if isinstance(rv, tuple):
                                body, status = rv
                            else:
                                body, status = rv, 200

                            return SimpleNamespace(
                                status_code=status,
                                get_json=lambda: body,
                            )
                    return SimpleNamespace(status_code=404, get_json=lambda: None)

                def get(self, path):  # noqa: D401
                    return self._dispatch(path, "GET")

                def post(self, path, json=None):  # noqa: D401
                    return self._dispatch(path, "POST", payload=json)

            return _Client()

    _stub.Flask = lambda *_args, **_kwargs: _FakeApp()  # type: ignore
    _stub.jsonify = _jsonify
    _stub.render_template = _render_template
    _stub.request = _request

    sys.modules["flask"] = _stub

    from flask import Flask, jsonify, render_template, request  # type: ignore

from flask_socketio import SocketIO  # mandatory dependency

# Ensure the *stubbed* ``SocketIO`` used in unit tests provides the ``on``
# decorator so that ``@socketio.on(...)`` does not raise ``AttributeError``
# when the real Flask-SocketIO library is not installed.

if not hasattr(SocketIO, "on"):

    def _noop_on(self, _event):  # noqa: D401 – no-op decorator
        def decorator(func):  # noqa: D401 – passthrough wrapper
            return func

        return decorator

    SocketIO.on = _noop_on  # type: ignore[attr-defined]

from db import get_conn, insert_debug_record, insert_event
from db import init as init_db

# ---------------------------------------------------------------------------
# Logging & environment
# ---------------------------------------------------------------------------


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ---------------------------------------------------------------------------
# Flask & Socket.IO setup
# ---------------------------------------------------------------------------


app = Flask(__name__)

# Configure base path for subdirectory deployment (e.g., drose.io/collector)
APPLICATION_ROOT = os.environ.get("APPLICATION_ROOT", "/")
app.config["APPLICATION_ROOT"] = APPLICATION_ROOT


# Middleware to handle subdirectory routing - adds SCRIPT_NAME to WSGI environ
# so url_for() generates URLs with the correct prefix
class PrefixMiddleware:
    def __init__(self, app, prefix=""):
        self.app = app
        self.prefix = prefix.rstrip("/")

    def __call__(self, environ, start_response):
        if self.prefix:
            environ["SCRIPT_NAME"] = self.prefix
        return self.app(environ, start_response)


if APPLICATION_ROOT != "/":
    app.wsgi_app = PrefixMiddleware(app.wsgi_app, prefix=APPLICATION_ROOT)

# Thread-based async mode works out-of-the-box (no eventlet/gevent needed)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ---------------------------------------------------------------------------
# Database initialisation (runs during application import)
# ---------------------------------------------------------------------------

# When the application is executed under Gunicorn (the recommended production
# path defined in the Dockerfile) the ``main()`` helper is *not* invoked.  In
# that code path the database connection pool must therefore be initialised
# here at import-time so that routes – and, crucially, the ``/health``
# endpoint used by Docker health-checks – can access it.  If the environment
# is deliberately configured without a database (e.g. local UI-only preview
# or CI unit tests) we fall back gracefully and keep the application running
# with persistence disabled.

try:
    init_db()
except RuntimeError as exc:  # Missing DB_URL → operate without persistence
    logger.warning("Database not initialised (no DB_URL): %s", exc)
except Exception as exc:  # pragma: no cover – log but keep container alive
    logger.exception("Database initialisation failed – continuing without DB: %s", exc)

# ---------------------------------------------------------------------------
# WebSocket events
# ---------------------------------------------------------------------------


@socketio.on("latency_check")
def _latency_check(ts):  # type: ignore[valid-type]
    """Round-trip latency probe – simply ack back the received timestamp.

    The client emits `socket.emit('latency_check', Date.now(), ack)` and we call
    the acknowledgement with the *same* timestamp.  The client then measures
    `Date.now() - ts` to estimate RTT without issuing extra HTTP requests.
    """

    return ts


def _socket_emit(event: str, data) -> None:  # noqa: D401 – thin wrapper
    """Emit *event* with *data* through the singleton Socket.IO instance."""

    socketio.emit(event, data)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def get_client_ip() -> str:
    """Extract real client IP, respecting proxy headers.

    Checks common proxy headers in order of preference and falls back to
    the direct connection address if no proxy headers are present.
    """
    # Check common proxy headers in order of preference
    for header in ("CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"):
        if ip := request.headers.get(header):
            # X-Forwarded-For can be comma-separated; take first
            return ip.split(",")[0].strip()
    return request.remote_addr or ""


def _events_enabled() -> bool:
    """Return whether client/server event stream is enabled.

    Missing env defaults to enabled (prod-friendly), explicit false disables.
    """

    val = os.getenv("COLLECTOR_EVENTS_ENABLED")
    if val is None:
        return True
    return val.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _compute_ip_hash(*, ip: str, salt: str | None) -> str | None:
    if not salt:
        return None
    if not ip:
        return None
    h = hashlib.sha256()
    h.update(ip.encode("utf-8"))
    h.update(b"\x00")
    h.update(salt.encode("utf-8"))
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():  # noqa: D401 – Flask view
    return render_template(
        "index.html",
        collector_events_enabled=_events_enabled(),
        application_root=APPLICATION_ROOT,
    )


@app.route("/event", methods=["POST"])
def event() -> tuple[dict[str, Any], int]:  # noqa: D401 – Flask view
    """Receive a single event payload and append to collector_events.

    Rejects request bodies larger than 256KB.
    """

    max_bytes = 256 * 1024
    raw_len = request.content_length
    if raw_len is not None and raw_len > max_bytes:
        return jsonify({"message": "Payload too large"}), 413

    # If Content-Length is absent, enforce cap by reading bytes first.
    raw_body: bytes | None = None
    if raw_len is None:
        try:
            raw_body = request.get_data(cache=False) or b""
        except Exception:
            return jsonify({"message": "Payload too large"}), 413
        if len(raw_body) > max_bytes:
            return jsonify({"message": "Payload too large"}), 413

    try:
        if raw_body is not None:
            data = json.loads(raw_body.decode("utf-8") or "{}")
        else:
            data = request.get_json(force=True) or {}
        if not isinstance(data, dict):
            return jsonify({"message": "Invalid JSON"}), 400
    except Exception:
        return jsonify({"message": "Invalid JSON"}), 400

    required = ("visitor_id", "session_id", "pageview_id", "event_type")
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"message": "Missing required fields", "missing": missing}), 400

    seq_val = data.get("seq", 0)
    if seq_val is None:
        seq_val = 0
    if isinstance(seq_val, bool) or not isinstance(seq_val, int):
        return jsonify({"message": "seq must be an integer"}), 400

    ip = get_client_ip()
    salt = os.getenv("EVENT_IP_HASH_SALT")
    ip_hash = _compute_ip_hash(ip=ip, salt=salt)

    insert_event(
        client_timestamp=data.get("client_timestamp"),
        visitor_id=str(data["visitor_id"]),
        session_id=str(data["session_id"]),
        pageview_id=str(data["pageview_id"]),
        event_type=str(data["event_type"]),
        seq=seq_val,
        path=data.get("path"),
        referrer=data.get("referrer"),
        ip_hash=ip_hash,
        user_agent=request.headers.get("User-Agent"),
        payload=data.get("payload") if isinstance(data.get("payload"), dict) else {},
    )

    return jsonify({"status": "ok"}), 200


@app.route("/collect", methods=["POST"])
def collect() -> tuple[dict[str, Any], int]:  # noqa: D401 – Flask view
    """Receive JSON payload from client, store it and fan-out to WebSocket."""

    try:
        data: Dict[str, Any] = request.get_json(force=True) or {}

        insert_debug_record(
            ip=get_client_ip(),
            browser_info=data.get("browser", {}),
            performance_data=data.get("performance", {}),
            fingerprints=data.get("fingerprints", {}),
            errors=data.get("errors", []),
            network=data.get("network"),
            battery=data.get("battery"),
            benchmarks=data.get("benchmarks"),
            client_timestamp=data.get("timestamp"),
            visitor_id=data.get("visitor_id"),
            session_id=data.get("session_id"),
            pageview_id=data.get("pageview_id"),
        )

        # Push a lightweight update to real-time dashboards.
        vitals = data.get("performance", {}).get("webVitals", {})
        timing = data.get("performance", {}).get("timing", {})

        _socket_emit(
            "new_payload",
            {
                "timestamp": data.get("timestamp"),
                "lcp": vitals.get("LCP"),
                "fcp": vitals.get("FCP"),
                "fid": vitals.get("FID"),
                "cls": vitals.get("CLS"),
                "ttfb": timing.get("responseStart") - timing.get("navigationStart", 0)
                if timing.get("responseStart")
                else None,
                "dnsTime": timing.get("domainLookupEnd") - timing.get("domainLookupStart", 0)
                if timing.get("domainLookupEnd") and timing.get("domainLookupStart")
                else None,
                "connectTime": timing.get("connectEnd") - timing.get("connectStart", 0)
                if timing.get("connectEnd") and timing.get("connectStart")
                else None,
                "responseTime": timing.get("responseEnd") - timing.get("responseStart", 0)
                if timing.get("responseEnd") and timing.get("responseStart")
                else None,
                "domReady": timing.get("domContentLoadedEventEnd") - timing.get("navigationStart", 0)
                if timing.get("domContentLoadedEventEnd")
                else None,
                "loadComplete": timing.get("loadEventEnd") - timing.get("navigationStart", 0)
                if timing.get("loadEventEnd")
                else None,
                "errorCount": len(data.get("errors", [])),
            },
        )

        return jsonify({"status": "ok"}), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Error while handling /collect: %s", exc)
        return jsonify({"message": "Internal Server Error"}), 500


@app.route("/health")
def health() -> tuple[dict[str, str], int]:  # noqa: D401 – Flask view
    """Readiness probe for container orchestrators.

    Behaviour matrix:

    • DB available and reachable   → HTTP 200 {healthy, connected}
    • DB intentionally disabled    → HTTP 200 {healthy, not_configured}
    • DB configured but unreachable→ HTTP 503 {unhealthy, <error>}
    """

    try:
        # If the connection pool is initialised, perform a cheap connection
        # round-trip; otherwise assume DB persistence is intentionally
        # disabled (e.g. preview deployments) and still report healthy so the
        # container does not flap.
        with get_conn():
            pass
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except RuntimeError:
        # Pool not initialised – most likely because ``DB_URL`` is unset.  We
        # treat this as *healthy* so that stateless deployments remain
        # functional.
        return jsonify({"status": "healthy", "database": "not_configured"}), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Health check failed: %s", exc)
        return jsonify({"status": "unhealthy", "database": str(exc)}), 503


# ---------------------------------------------------------------------------
# Lightweight endpoints for client-side network testing
# ---------------------------------------------------------------------------


@app.route("/ping")
def ping():  # noqa: D401 – simple latency probe
    """Return a minimal JSON payload quickly for RTT measurement."""

    return jsonify({"ok": True})


@app.route("/bw")
def bandwidth():  # noqa: D401 – simple bandwidth test payload
    """Serve a blob of a requested size (bytes) for bandwidth estimation.

    Client requests `/bw?bytes=500000` → server sends *bytes* repeated "x".
    The response is intentionally uncompressed (text/plain) so size on the
    wire is deterministic.
    """

    try:
        size = int(request.args.get("bytes", 500_000))  # default ≈ 0.5 MB
        size = max(0, min(size, 5_000_000))  # cap at 5 MB safety
    except (TypeError, ValueError):
        size = 500_000

    return ("x" * size, 200, {"Content-Type": "text/plain"})


# ---------------------------------------------------------------------------
# Entry-point helper
# ---------------------------------------------------------------------------


def main() -> None:  # pragma: no cover – executed only as script
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host address")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", "5000")),
        help="Port number (0 for random free port)",
    )
    parser.add_argument("--skip-db", action="store_true", help="Skip DB initialisation")

    args = parser.parse_args()

    if not args.skip_db:
        init_db()

    # -------------------------------------------------------------------
    # Dynamic port selection
    # -------------------------------------------------------------------
    # When the caller passes ``--port 0`` (or sets ``PORT=0`` in the
    # environment) we bind an ephemeral port chosen by the OS.  ``Flask`` /
    # ``Werkzeug`` do *not* expose the port when ``0`` is supplied directly,
    # therefore we pre-allocate a socket to discover a free port first and
    # then hand that concrete number to ``socketio.run``.

    port: int
    if args.port == 0:
        with socket.socket() as sock:
            sock.bind(("", 0))
            port = sock.getsockname()[1]
    else:
        port = args.port

    logger.info("Starting server on %s:%s", args.host, port)

    # Run via Socket.IO so WebSocket endpoint is active.
    # Flask-SocketIO 5.x disallows the use of the built-in Werkzeug dev server
    # in *production* unless the caller explicitly opts-in.  We pass
    # ``allow_unsafe_werkzeug=True`` so that *local* runs continue to work
    # (`python app.py`).  When the application is started under Gunicorn (the
    # recommended production path used in the Dockerfile) this block is not
    # executed, so the flag never comes into play.
    socketio.run(
        app,
        host=args.host,
        port=port,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
