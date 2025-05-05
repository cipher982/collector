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
    """Simple readiness probe used by Docker/K8s health-checks."""

    try:
        # Cheap connection test
        with get_conn():
            pass
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Health check failed: %s", exc)
        return jsonify({"status": "unhealthy", "database": str(exc)}), 500


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
    socketio.run(app, host=args.host, port=args.port)


if __name__ == "__main__":  # pragma: no cover
    main()
