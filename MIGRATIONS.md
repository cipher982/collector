# Migration System Implementation Summary

This document summarizes the SQL migrations system added to the collector application.

## Problem Statement

The collector app had schema drift:
- Code in `db.py` declared all columns as JSONB
- Production database had TEXT columns for the original 4 fields (browser_info, performance_data, fingerprints, errors)
- The inline `CREATE TABLE IF NOT EXISTS` statement couldn't modify existing columns
- No migration tracking meant changes couldn't be applied incrementally

## Solution: Simple SQL Migrations

Implemented a lightweight migration system without heavy dependencies:

### Files Created

1. **migrations/001_initial_schema.sql** - Original table structure
2. **migrations/002_add_phase1_columns.sql** - Phase 1 additions (network, battery, etc.)
3. **migrations/003_convert_text_to_jsonb.sql** - TEXT→JSONB conversion
4. **migrations.py** - Migration runner with tracking
5. **migrate.py** - CLI wrapper for convenience
6. **migrations/README.md** - Documentation

### Files Modified

- **db.py** - Updated `init_schema()` to use migration runner instead of inline DDL

## How It Works

1. **Tracking**: Migrations are tracked in `schema_migrations` table
2. **Ordering**: Migrations run in alphabetical order (numeric prefixes: 001, 002, ...)
3. **Transactions**: Each migration wrapped in a transaction (rollback on failure)
4. **Safety**: TEXT→JSONB conversion handles malformed data gracefully using PL/pgSQL function
5. **Automatic**: Migrations run automatically on app startup via `db.init_schema()`

## Usage

### Run pending migrations:
```bash
uv run python migrate.py
```

### List migration status:
```bash
uv run python migrate.py --list
```

### Alternative methods:
```bash
uv run python -m migrations
uv run python -m migrations --list
```

## Testing Results

- ✅ All 3 migrations applied successfully
- ✅ Schema verified: all columns now JSONB
- ✅ Data insertion works correctly
- ✅ Data retrieval returns native Python dicts
- ✅ App starts successfully
- ✅ Health check passes
- ✅ Migrations run automatically on startup

## Key Features

1. **No dependencies** - Uses only psycopg2 (already in requirements)
2. **Transaction-safe** - Rollback on failure
3. **Idempotent** - Safe to run multiple times
4. **Logging** - Clear progress messages
5. **Graceful degradation** - Handles malformed JSON data
6. **Simple** - No ORM, no heavy framework

## Migration 003 Details

The TEXT→JSONB conversion migration handles edge cases:
- NULL values → NULL
- Empty strings → empty JSON object/array
- Valid JSON → parsed directly
- Invalid JSON → empty JSON object/array (graceful fallback)

Uses a temporary PL/pgSQL function `safe_text_to_jsonb()` to handle conversion errors gracefully, then drops the function after use.

## Next Steps

To add new migrations:
1. Create `004_description.sql` in migrations/ directory
2. Write SQL using PostgreSQL syntax
3. Use idempotent patterns (IF NOT EXISTS, etc.)
4. Test locally first
5. Run `uv run python migrate.py` to apply
