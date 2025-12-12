-- Phase 2: identity keys for journey tracking
--
-- Adds visitor_id, session_id, pageview_id to link payloads into sessions
-- and pageviews. These are client-generated pseudonymous identifiers.

ALTER TABLE debug_data
    ADD COLUMN IF NOT EXISTS visitor_id TEXT,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS pageview_id TEXT;

-- Helpful indexes for common queries (visitor/session timelines)
CREATE INDEX IF NOT EXISTS idx_debug_data_visitor_ts ON debug_data (visitor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_data_session_ts ON debug_data (session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_data_pageview_ts ON debug_data (pageview_id, timestamp DESC);

