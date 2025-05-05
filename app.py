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
import logging
from typing import Any, Dict

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO  # mandatory dependency

from db import get_conn, insert_debug_record
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
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():  # noqa: D401 – Flask view
    return render_template("index.html")


@app.route("/collect", methods=["POST"])
def collect() -> tuple[dict[str, Any], int]:  # noqa: D401 – Flask view
    """Receive JSON payload from client, store it and fan-out to WebSocket."""

    try:
        data: Dict[str, Any] = request.get_json(force=True) or {}

        insert_debug_record(
            ip=request.remote_addr or "",  # may be None in CLI tests
            browser_info=data.get("browser", {}),
            performance_data=data.get("performance", {}),
            fingerprints=data.get("fingerprints", {}),
            errors=data.get("errors", []),
        )

        # Push a lightweight update to real-time dashboards.
        vitals = data.get("performance", {}).get("webVitals", {})
        _socket_emit(
            "new_payload",
            {
                "timestamp": data.get("timestamp"),
                "lcp": vitals.get("LCP"),
                "fid": vitals.get("FID"),
                "cls": vitals.get("CLS"),
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
    parser.add_argument("--port", type=int, default=5000, help="Port number")
    parser.add_argument("--skip-db", action="store_true", help="Skip DB initialisation")

    args = parser.parse_args()

    if not args.skip_db:
        init_db()

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
        port=args.port,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
