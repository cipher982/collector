"""Minimal SQL migrations system for the collector application.

Provides a lightweight, dependency-free migration runner that:
- Tracks applied migrations in a dedicated table
- Runs migrations in order, skipping already-applied ones
- Wraps each migration in a transaction (rollback on failure)
- Logs progress to stdout

Usage:
    python -m migrations           # Run pending migrations
    python -m migrations --list    # List migration status
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


class MigrationRunner:
    """Simple SQL migration runner."""

    def __init__(self, dsn: str, migrations_dir: Path) -> None:
        """Initialize the migration runner.

        Args:
            dsn: PostgreSQL connection string
            migrations_dir: Path to directory containing .sql migration files
        """
        self.dsn = dsn
        self.migrations_dir = migrations_dir

    def _get_connection(self) -> psycopg2.extensions.connection:
        """Create a new database connection."""
        return psycopg2.connect(self.dsn)

    def _ensure_migrations_table(self, conn: psycopg2.extensions.connection) -> None:
        """Create the schema_migrations tracking table if it doesn't exist."""
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    id SERIAL PRIMARY KEY,
                    migration_name TEXT NOT NULL UNIQUE,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()

    def _get_applied_migrations(self, conn: psycopg2.extensions.connection) -> set[str]:
        """Return set of migration names that have already been applied."""
        with conn.cursor() as cur:
            cur.execute("SELECT migration_name FROM schema_migrations ORDER BY migration_name")
            return {row[0] for row in cur.fetchall()}

    def _get_pending_migrations(self) -> list[tuple[str, Path]]:
        """Return sorted list of (name, path) for unapplied migrations.

        Migrations are sorted by filename to ensure consistent ordering.
        """
        conn = self._get_connection()
        try:
            self._ensure_migrations_table(conn)
            applied = self._get_applied_migrations(conn)
        finally:
            conn.close()

        # Find all .sql files in migrations directory
        migration_files = sorted(self.migrations_dir.glob("*.sql"))

        pending = []
        for migration_file in migration_files:
            migration_name = migration_file.stem
            if migration_name not in applied:
                pending.append((migration_name, migration_file))

        return pending

    def _apply_migration(self, conn: psycopg2.extensions.connection, migration_name: str, migration_path: Path) -> None:
        """Apply a single migration within a transaction."""
        sql = migration_path.read_text()

        logger.info("Applying migration: %s", migration_name)

        with conn.cursor() as cur:
            # Execute the migration SQL
            cur.execute(sql)

            # Record the migration as applied
            cur.execute(
                "INSERT INTO schema_migrations (migration_name) VALUES (%s)",
                (migration_name,),
            )

        conn.commit()
        logger.info("Successfully applied migration: %s", migration_name)

    def run(self) -> None:
        """Run all pending migrations."""
        pending = self._get_pending_migrations()

        if not pending:
            logger.info("No pending migrations")
            return

        logger.info("Found %d pending migration(s)", len(pending))

        conn = self._get_connection()
        try:
            for migration_name, migration_path in pending:
                try:
                    self._apply_migration(conn, migration_name, migration_path)
                except Exception as exc:
                    logger.exception("Migration failed: %s", migration_name)
                    conn.rollback()
                    raise RuntimeError(f"Migration {migration_name} failed: {exc}") from exc
        finally:
            conn.close()

        logger.info("All migrations applied successfully")

    def list_status(self) -> None:
        """Print the status of all migrations (applied vs pending)."""
        conn = self._get_connection()
        try:
            self._ensure_migrations_table(conn)
            applied = self._get_applied_migrations(conn)
        finally:
            conn.close()

        # Find all migration files
        migration_files = sorted(self.migrations_dir.glob("*.sql"))

        if not migration_files:
            logger.info("No migrations found in %s", self.migrations_dir)
            return

        logger.info("Migration Status:")
        logger.info("-" * 60)

        for migration_file in migration_files:
            migration_name = migration_file.stem
            status = "APPLIED" if migration_name in applied else "PENDING"
            logger.info("  [%s] %s", status, migration_name)

        logger.info("-" * 60)
        logger.info(
            "Total: %d migrations (%d applied, %d pending)",
            len(migration_files),
            len(applied),
            len(migration_files) - len(applied),
        )


def main() -> None:
    """CLI entry point for running migrations."""
    import argparse

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    # Parse arguments
    parser = argparse.ArgumentParser(description="Run database migrations")
    parser.add_argument(
        "--list",
        action="store_true",
        help="List migration status instead of applying",
    )
    args = parser.parse_args()

    # Load environment
    load_dotenv()
    dsn = os.getenv("DB_URL")
    if not dsn:
        raise RuntimeError("Environment variable DB_URL must be defined")

    # Locate migrations directory
    migrations_dir = Path(__file__).parent / "migrations"
    if not migrations_dir.exists():
        raise RuntimeError(f"Migrations directory not found: {migrations_dir}")

    # Run migrations
    runner = MigrationRunner(dsn, migrations_dir)

    if args.list:
        runner.list_status()
    else:
        runner.run()


if __name__ == "__main__":
    main()
