"""Flask entry-point for the Browser Debug Dashboard.

The module is intentionally slim – it delegates all persistence work to
`db.py` and keeps only routing and request/response concerns here.
"""

from __future__ import annotations

import argparse
import logging
from typing import Any
from typing import Dict

from dotenv import load_dotenv
from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request

from db import get_conn
from db import init as init_db
from db import insert_debug_record

# -------------------------------------------------------------------------
# Logging & env
# -------------------------------------------------------------------------


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()


# -------------------------------------------------------------------------
# Flask setup
# -------------------------------------------------------------------------


app = Flask(__name__)


# -------------------------------------------------------------------------
# Routes
# -------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/collect", methods=["POST"])
def collect() -> tuple[dict[str, Any], int]:
    try:
        data: Dict[str, Any] = request.get_json(force=True) or {}

        insert_debug_record(
            ip=request.remote_addr or "",  # may be None in CLI tests
            browser_info=data.get("browser", {}),
            performance_data=data.get("performance", {}),
            fingerprints=data.get("fingerprints", {}),
            errors=data.get("errors", []),
        )

        return jsonify({"status": "ok"}), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Error while handling /collect: %s", exc)
        return jsonify({"message": "Internal Server Error"}), 500


@app.route("/health")
def health() -> tuple[dict[str, str], int]:
    try:
        # Simple connection test
        with get_conn():
            pass
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Health check failed: %s", exc)
        return jsonify({"status": "unhealthy", "database": str(exc)}), 500


# -------------------------------------------------------------------------
# Entry-point
# -------------------------------------------------------------------------


def main() -> None:  # pragma: no cover – executed only as script
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host address")
    parser.add_argument("--port", type=int, default=5000, help="Port number")
    parser.add_argument("--skip-db", action="store_true", help="Skip database initialisation")

    args = parser.parse_args()

    if not args.skip_db:
        init_db()

    app.run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
