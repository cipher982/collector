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
  COLLECTOR_EVENTS_ENABLED — Enable/disable client event emission (missing env defaults to enabled)
  EVENT_IP_HASH_SALT — Salt used to compute `ip_hash` for events (when missing, `ip_hash` is stored as NULL)

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
- POST /event     — Receives a single event and appends it to `collector_events` (rejects bodies > 256KB)
- GET  /health    — Returns `{ status: "healthy", database: "connected" }` if DB connection succeeds, otherwise an error

POST /event (example)
```json
{
  "visitor_id": "v_...",
  "session_id": "s_...",
  "pageview_id": "p_...",
  "event_type": "pageview",
  "seq": 1,
  "client_timestamp": "2025-01-01T00:00:00Z",
  "path": "/",
  "referrer": null,
  "payload": { "k": "v" }
}
```

DATABASE MIGRATIONS
The application uses a simple SQL migration system (no heavy dependencies like Alembic). Migrations are tracked and applied automatically on startup.

To manually run migrations:
    python migrate.py           # Apply pending migrations
    python migrate.py --list    # Show migration status

See `MIGRATIONS.md` for full documentation of the migration system.  

FRONTEND WORKFLOW
1. On page load (`window.onload`), initialize UI tabs and start data collection.  
2. JavaScript:
   - Sets up global error handler to capture errors.  
   - Calls collectors for browser info, performance timing, canvas fingerprint, font detection, WebGL info.  
   - Renders metrics into the UI: status indicators, browser details, Chart.js bar chart for top resources, fingerprint sections, raw JSON.  
   - After a short delay (CONFIG.COLLECTION_DELAY), sends the assembled JSON to `/collect`.  

DATABASE SCHEMA
Table: debug_data
- id                SERIAL PRIMARY KEY
- ip                TEXT
- browser_info      JSONB
- performance_data  JSONB
- fingerprints      JSONB
- errors            JSONB
- network           JSONB
- battery           JSONB
- benchmarks        JSONB
- client_timestamp  TIMESTAMPTZ
- timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP

The schema is managed by SQL migrations in the `migrations/` directory. See `MIGRATIONS.md` for details.  

Table: collector_events
- id                BIGSERIAL PRIMARY KEY
- received_at        TIMESTAMPTZ NOT NULL DEFAULT now()
- client_timestamp   TIMESTAMPTZ
- visitor_id         TEXT NOT NULL
- session_id         TEXT NOT NULL
- pageview_id        TEXT NOT NULL
- event_type         TEXT NOT NULL
- seq                INTEGER NOT NULL DEFAULT 0
- path               TEXT
- referrer           TEXT
- ip_hash            TEXT
- user_agent         TEXT
- payload            JSONB NOT NULL DEFAULT '{}'::jsonb

Example queries
```sql
-- Visitor journey
SELECT received_at, event_type, path, payload
FROM collector_events
WHERE visitor_id = 'v_...'
ORDER BY received_at ASC;

-- Session timeline
SELECT received_at, event_type, path, payload
FROM collector_events
WHERE session_id = 's_...'
ORDER BY received_at ASC;

-- Pageview reconstruction
SELECT seq, received_at, event_type, payload
FROM collector_events
WHERE pageview_id = 'p_...'
ORDER BY seq ASC;

-- Counts/day (pageviews)
SELECT date_trunc('day', received_at) AS day, count(*) AS pageviews
FROM collector_events
WHERE event_type = 'pageview'
GROUP BY 1
ORDER BY 1;

-- Visitors/day (approx via pageview events)
SELECT date_trunc('day', received_at) AS day, count(DISTINCT visitor_id) AS visitors
FROM collector_events
WHERE event_type = 'pageview'
GROUP BY 1
ORDER BY 1;

-- Sessions/day (approx via pageview events)
SELECT date_trunc('day', received_at) AS day, count(DISTINCT session_id) AS sessions
FROM collector_events
WHERE event_type = 'pageview'
GROUP BY 1
ORDER BY 1;

-- Perf by browser (coarse UA family, from webvitals payload)
SELECT
  CASE
    WHEN user_agent ILIKE '%Chrome/%' AND user_agent NOT ILIKE '%Edg/%' THEN 'Chrome'
    WHEN user_agent ILIKE '%Edg/%' THEN 'Edge'
    WHEN user_agent ILIKE '%Firefox/%' THEN 'Firefox'
    WHEN user_agent ILIKE '%Safari/%' AND user_agent NOT ILIKE '%Chrome/%' THEN 'Safari'
    ELSE 'Other'
  END AS browser_family,
  count(*) AS n_events,
  avg((payload->>'LCP')::double precision) AS avg_lcp,
  avg((payload->>'FCP')::double precision) AS avg_fcp,
  avg((payload->>'FID')::double precision) AS avg_fid,
  avg((payload->>'CLS')::double precision) AS avg_cls
FROM collector_events
WHERE event_type = 'webvitals'
GROUP BY 1
ORDER BY n_events DESC;
```

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
