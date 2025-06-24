#Collector

This application is a real-time browser data collector and dashboard. It gathers browser information, performance metrics, fingerprinting data and client-side errors from users’ browsers, displays them in a tabbed UI, and stores the collected data in a PostgreSQL database for later analysis.

KEY FEATURES
- Browser Information: user agent, language, platform, screen resolution, device memory, hardware concurrency, cookies status, online status, do-not-track setting  
- Performance Metrics: navigation timing, resource load times, resource sizes, JavaScript heap memory usage  
- Fingerprinting Data: canvas fingerprint, available system fonts, WebGL vendor/renderer/version  
- Error Tracking: captures global JavaScript errors with stack traces and timestamps  
- Dashboard UI: four tabs (Overview, Performance, Fingerprint, Raw Data) built with Pico.css and Chart.js  
- Backend API: Flask app with endpoints to serve the dashboard, collect data, and report health status  
- Persistence: stores each submission in a PostgreSQL table (`debug_data`)  
- Containerized: Dockerfile to build the app image, docker-compose.yml for local development  

TECH STACK
- Backend: Python 3.12, Flask, psycopg2 (PostgreSQL driver), python-dotenv  
- Frontend: Vanilla JavaScript, Chart.js for charts, Pico.css for styling  
- Infrastructure: Docker, docker-compose, healthchecks via curl  
- Linting & Formatting: ruff (pre-commit hooks)  

REPOSITORY STRUCTURE
.  
├── app.py                 # Main Flask application  
├── Dockerfile             # Builds the app container  
├── docker-compose.yml     # Service definition for local development  
├── pyproject.toml         # Project metadata and dependencies  
├── .pre-commit-config.yaml# Lint/format hooks configuration  
├── static/                # Client-side assets  
│   └── script.js          # Data collection and UI logic  
└── templates/             # Jinja2 templates  
    └── index.html         # Main dashboard page  

ENVIRONMENT & CONFIGURATION
The application reads configuration from environment variables (via a `.env` file in development):

  DB_URL    — PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/dbname`)

The Flask app uses `DB_URL` to initialize the `debug_data` table on startup (unless `--skip-db` is passed) and to insert new records on each `/collect` request.

LOCAL DEVELOPMENT

Prerequisites
- Docker & Docker Compose OR Python 3.12 and virtualenv
- PostgreSQL instance accessible via `DB_URL`

Using Docker Compose
1. Create a Docker network named `coolify` (or adapt `docker-compose.yml` to your network):
     docker network create coolify
2. Place a `.env` file in project root with your `DB_URL`.
3. Build and start:
     docker-compose up --build
4. Visit http://localhost:5001 to see the dashboard. Data will be posted to the Flask service running on port 5000 inside the container.

Running Locally without Docker
1. python3 -m venv venv && source venv/bin/activate  
2. pip install --upgrade pip  
3. pip install flask psycopg2-binary python-dotenv  
4. Create a `.env` file with `DB_URL`.  
5. Initialize the database and start the server:
     python app.py
6. Open http://localhost:5000 in your browser.

APPLICATION ENDPOINTS
- GET  /          — Serves the dashboard (index.html)  
- POST /collect   — Receives JSON payload with browser, performance, fingerprint and error data; stores it and returns the same payload as JSON  
- GET  /health    — Returns `{ status: "healthy", database: "connected" }` if DB connection succeeds, otherwise an error  

FRONTEND WORKFLOW
1. On page load (`window.onload`), initialize UI tabs and start data collection.  
2. JavaScript:
   - Sets up global error handler to capture errors.  
   - Calls collectors for browser info, performance timing, canvas fingerprint, font detection, WebGL info.  
   - Renders metrics into the UI: status indicators, browser details, Chart.js bar chart for top resources, fingerprint sections, raw JSON.  
   - After a short delay (CONFIG.COLLECTION_DELAY), sends the assembled JSON to `/collect`.  

DATABASE SCHEMA
Table: debug_data
- id            SERIAL PRIMARY KEY  
- ip            TEXT  
- browser_info  TEXT (stringified JSON)  
- performance_data TEXT (stringified JSON)  
- fingerprints  TEXT (stringified JSON)  
- errors        TEXT (stringified JSON)  
- timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP  

EXTENDING THE APP
- Add new metrics in `static/script.js` under the `collectors` object and update UI rendering functions in the `ui` object.  
- To support other storage backends, abstract database calls in `app.py` into a separate module or service layer.  
- Customize the frontend template (`templates/index.html`) and styling to match your branding or add new tabs.  
- Enhance error tracking by pushing errors to a separate table or external logging service.  

TROUBLESHOOTING
- Database connection failures: verify `DB_URL`, network access, and that the PostgreSQL server is running.  
- Port conflicts: ensure nothing is bound to 5000 (Flask) or 5001 (mapped host port).  
- Docker healthcheck failures: the container will be marked unhealthy if `/health` cannot connect to the database. Check container logs.  
- Lint/format issues: run `pre-commit run --all-files` to apply fixes before committing.  

LOGGING
The Flask app logs to stdout at INFO level. Look for:
- “Attempting database connection…” on startup  
- Errors during DB initialization or insert operations  
- Incoming payloads and client IP addresses