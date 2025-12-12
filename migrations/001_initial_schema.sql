-- Initial schema for debug_data table
-- Original table with TEXT columns for browser_info, performance_data, fingerprints, errors

CREATE TABLE IF NOT EXISTS debug_data (
    id              SERIAL PRIMARY KEY,
    ip              TEXT,
    browser_info    TEXT,
    performance_data TEXT,
    fingerprints    TEXT,
    errors          TEXT,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
