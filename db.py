"""Database utility module.

Centralises all PostgreSQL access logic so the rest of the application can
interact with the database through a minimal, safe API.  A connection pool is
created on startup and a context-manager wrapper exposes pooled connections.

All payload columns are stored as native JSONB, which makes future querying of
individual keys efficient and type-safe.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2.extras import Json
from psycopg2.pool import SimpleConnectionPool

# Application-wide logger.
logger = logging.getLogger(__name__)


class _Database:
    """Lightweight wrapper around a psycopg2 connection pool."""

    def __init__(self) -> None:
        self._pool: SimpleConnectionPool | None = None

    # ---------------------------------------------------------------------
    # Pool management
    # ---------------------------------------------------------------------
    def init_pool(self, dsn: str, *, minconn: int = 1, maxconn: int = 5) -> None:
        """Initialise the global connection pool.

        Should be called once during application bootstrap. Subsequent calls
        are ignored if the pool is already initialised.
        """

        if self._pool is not None:
            logger.debug("Database pool already initialised – skipping.")
            return

        logger.info("Initialising database connection pool …")
        try:
            self._pool = SimpleConnectionPool(minconn, maxconn, dsn=dsn)
        except psycopg2.Error as exc:
            logger.exception("Failed to establish database connection pool: %s", exc)
            raise

    @property
    def pool(self) -> SimpleConnectionPool:
        if self._pool is None:
            raise RuntimeError("Database pool accessed before initialisation.")
        return self._pool

    # ------------------------------------------------------------------
    # High-level helpers
    # ------------------------------------------------------------------
    @contextmanager
    def get_conn(self) -> Generator[psycopg2.extensions.connection, None, None]:
        """Yield a pooled connection, returning it afterwards."""

        conn = self.pool.getconn()
        try:
            yield conn
        finally:
            self.pool.putconn(conn)

    # ------------------------------------------------------------------
    # Schema helpers
    # ------------------------------------------------------------------
    def init_schema(self) -> None:
        """Run database migrations to ensure schema is up to date.

        The actual DDL is managed by SQL migration files in the migrations/
        directory. This method delegates to the migration runner to apply any
        pending migrations.

        For reference, the final schema should be:
            CREATE TABLE debug_data (
                id              SERIAL PRIMARY KEY,
                ip              TEXT,
                browser_info    JSONB,
                performance_data JSONB,
                fingerprints    JSONB,
                errors          JSONB,
                network         JSONB,
                battery         JSONB,
                benchmarks      JSONB,
                client_timestamp TIMESTAMPTZ,
                timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """
        from pathlib import Path

        from migrations import MigrationRunner

        migrations_dir = Path(__file__).parent / "migrations"
        runner = MigrationRunner(os.getenv("DB_URL", ""), migrations_dir)
        runner.run()

    # ------------------------------------------------------------------
    # Insert helpers
    # ------------------------------------------------------------------
    def insert_debug_record(
        self,
        *,
        ip: str,
        browser_info: dict,
        performance_data: dict,
        fingerprints: dict,
        errors: list,
        network: dict | None = None,
        battery: dict | None = None,
        benchmarks: dict | None = None,
        client_timestamp: str | None = None,
        visitor_id: str | None = None,
        session_id: str | None = None,
        pageview_id: str | None = None,
    ) -> None:
        """Persist a single record into *debug_data* table."""

        # If the pool is not initialised we silently skip persistence so that
        # stateless deployments (or preview environments) can continue to
        # operate without a database.
        try:
            sql = (
                "INSERT INTO debug_data (ip, browser_info, performance_data, "
                "fingerprints, errors, network, battery, benchmarks, client_timestamp, "
                "visitor_id, session_id, pageview_id) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            )

            with self.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        sql,
                        (
                            ip,
                            Json(browser_info),
                            Json(performance_data),
                            Json(fingerprints),
                            Json(errors),
                            Json(network) if network else None,
                            Json(battery) if battery else None,
                            Json(benchmarks) if benchmarks else None,
                            client_timestamp,
                            visitor_id,
                            session_id,
                            pageview_id,
                        ),
                    )
                    conn.commit()
        except RuntimeError:
            logger.debug("Insert skipped – database not configured.")

    def insert_event(
        self,
        *,
        client_timestamp: str | None = None,
        visitor_id: str,
        session_id: str,
        pageview_id: str,
        event_type: str,
        seq: int = 0,
        path: str | None = None,
        referrer: str | None = None,
        ip_hash: str | None = None,
        user_agent: str | None = None,
        payload: dict | None = None,
    ) -> None:
        """Persist a single event into *collector_events* table."""

        try:
            sql = (
                "INSERT INTO collector_events (client_timestamp, visitor_id, session_id, "
                "pageview_id, event_type, seq, path, referrer, ip_hash, user_agent, payload) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            )

            with self.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        sql,
                        (
                            client_timestamp,
                            visitor_id,
                            session_id,
                            pageview_id,
                            event_type,
                            seq,
                            path,
                            referrer,
                            ip_hash,
                            user_agent,
                            Json(payload or {}),
                        ),
                    )
                    conn.commit()
        except RuntimeError:
            logger.debug("Insert skipped – database not configured.")


# -------------------------------------------------------------------------
# Public singleton instance
# -------------------------------------------------------------------------


db = _Database()


# Convenience functions ----------------------------------------------------


def init() -> None:
    """Load env vars, create pool and ensure schema exists."""

    dsn = os.getenv("DB_URL")
    if not dsn:
        raise RuntimeError("Environment variable DB_URL must be defined.")

    db.init_pool(dsn)
    db.init_schema()


# Re-export frequently used helpers for terser imports in other modules.
get_conn = db.get_conn
insert_debug_record = db.insert_debug_record
insert_event = db.insert_event
