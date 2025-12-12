# Database Migrations

This directory contains SQL migration files for the collector application.

## Overview

The collector app uses a simple, lightweight migration system (no Alembic or heavy dependencies). Migrations are tracked in a `schema_migrations` table and applied in alphabetical order.

## Migration Files

- **001_initial_schema.sql** - Creates the original `debug_data` table with TEXT columns
- **002_add_phase1_columns.sql** - Adds network, battery, benchmarks, client_timestamp columns (JSONB)
- **003_convert_text_to_jsonb.sql** - Converts the original 4 TEXT columns to JSONB

## Usage

### Apply pending migrations:
```bash
uv run python migrate.py
```

### List migration status:
```bash
uv run python migrate.py --list
```

### Alternative invocation:
```bash
uv run python -m migrations
uv run python -m migrations --list
```

## How It Works

1. On startup, the app calls `db.init_schema()` which runs the migration system
2. The migration runner checks the `schema_migrations` table for applied migrations
3. Any `.sql` files in this directory that haven't been applied are run in order
4. Each migration is wrapped in a transaction - if it fails, it rolls back
5. Successfully applied migrations are recorded in `schema_migrations`

## Adding New Migrations

To add a new migration:

1. Create a new `.sql` file with a numeric prefix (e.g., `004_add_new_column.sql`)
2. Write your DDL using standard PostgreSQL syntax
3. Use idempotent patterns where possible (e.g., `ADD COLUMN IF NOT EXISTS`)
4. Test locally before deploying to production

## Migration Safety

- **Transactions**: Each migration runs in a transaction - failures trigger rollback
- **Idempotent**: Migrations use `IF NOT EXISTS` and similar patterns where possible
- **Ordered**: Migrations run in alphabetical order (use numeric prefixes: 001, 002, etc.)
- **Tracked**: Applied migrations are recorded in `schema_migrations` table
- **Safe defaults**: The TEXT→JSONB conversion handles malformed data gracefully

## Schema History

The schema evolved as follows:

1. **Initial schema** (001): Original table with TEXT columns for JSON data
2. **Phase 1 additions** (002): Added new fields (network, battery, benchmarks) as JSONB
3. **Schema normalization** (003): Converted original TEXT columns to JSONB

This created a schema drift where the original 4 columns were TEXT but the code expected JSONB. Migration 003 fixes this by converting TEXT→JSONB with safe error handling.
