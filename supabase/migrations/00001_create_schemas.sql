-- Migration 00001: Create schemas
-- Separates raw ingestion data from processed/normalized app data

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS app;

-- Grant usage to authenticated users (for RLS to work)
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT USAGE ON SCHEMA app TO anon;

-- Raw schema is only accessed by service_role (scanner + ingest)
GRANT USAGE ON SCHEMA raw TO service_role;
