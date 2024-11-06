# app.py
from flask import Flask, request, jsonify, render_template
import sqlite3
from datetime import datetime
import os
import argparse

app = Flask(__name__)

DATABASE = "data/debug_data.db"



def init_db():
    if not os.path.exists("data"):
        os.makedirs("data")
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS debug_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            browser_info TEXT,
            performance_data TEXT,
            fingerprints TEXT,
            errors TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


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
            "timestamp": data.get("timestamp")
        }
        
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO debug_data (ip, browser_info, performance_data, fingerprints, errors) VALUES (?, ?, ?, ?, ?)",
            (
                debug_info["ip"],
                str(debug_info["browser"]),
                str(debug_info["performance"]),
                str(debug_info["fingerprints"]),
                str(debug_info["errors"])
            )
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