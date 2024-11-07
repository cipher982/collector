import argparse
import logging
import os

import psycopg2
from dotenv import load_dotenv
from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)


DATABASE_URL = os.getenv("DB_URL")
logger.info(f"DATABASE_URL: {DATABASE_URL}")


def init_db():
    try:
        logger.info("Attempting database connection...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS debug_data (
                id SERIAL PRIMARY KEY,
                ip TEXT,
                browser_info TEXT,
                performance_data TEXT,
                fingerprints TEXT,
                errors TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()
        logger.info("Database initialization successful")
    except psycopg2.Error as e:
        logger.error(f"Database connection failed: {e}")
        raise


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/collect", methods=["POST"])
def collect():
    try:
        data = request.get_json()
        debug_info = {
            "ip": request.remote_addr,
            "browser": data.get("browser", {}),
            "performance": data.get("performance", {}),
            "fingerprints": data.get("fingerprints", {}),
            "errors": data.get("errors", []),
            "timestamp": data.get("timestamp"),
        }

        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO debug_data (
                ip, 
                browser_info, 
                performance_data, 
                fingerprints, 
                errors
            ) VALUES (
                %s, %s, %s, %s, %s
            )""",
            (
                debug_info["ip"],
                str(debug_info["browser"]),
                str(debug_info["performance"]),
                str(debug_info["fingerprints"]),
                str(debug_info["errors"]),
            ),
        )
        conn.commit()
        conn.close()

        return jsonify(debug_info), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"message": "Internal Server Error"}), 500


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="Host address")
    parser.add_argument("--port", type=int, default=5000, help="Port number")
    parser.add_argument("--skip-db", action="store_true", help="Skip database initialization")

    args = parser.parse_args()

    if not args.skip_db:
        init_db()
    app.run(host=args.host, port=args.port)
