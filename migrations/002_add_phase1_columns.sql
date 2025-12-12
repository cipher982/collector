-- Phase 1 additions: network, battery, benchmarks, client_timestamp
-- These columns were added as JSONB from the start

ALTER TABLE debug_data
    ADD COLUMN IF NOT EXISTS network JSONB,
    ADD COLUMN IF NOT EXISTS battery JSONB,
    ADD COLUMN IF NOT EXISTS benchmarks JSONB,
    ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ;
