-- Phase 3 (Option B): event stream table
--
-- Adds collector_events for privacy-first, append-only event capture.

CREATE TABLE IF NOT EXISTS collector_events (
    id BIGSERIAL PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_timestamp TIMESTAMPTZ NULL,
    visitor_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    pageview_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    path TEXT NULL,
    referrer TEXT NULL,
    ip_hash TEXT NULL,
    user_agent TEXT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collector_events_visitor_received_at
    ON collector_events (visitor_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_events_session_received_at
    ON collector_events (session_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_events_pageview_seq
    ON collector_events (pageview_id, seq ASC);

CREATE INDEX IF NOT EXISTS idx_collector_events_event_type_received_at
    ON collector_events (event_type, received_at DESC);
