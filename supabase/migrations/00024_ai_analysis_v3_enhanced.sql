-- ============================================================
-- 00024 — AI Analysis v3-enhanced: new score dimensions + structured analysis
-- Adds investigation & commercial steering scores, plus JSONB
-- for missed opportunities, strengths/improvements, diagnosis,
-- pillar evidence, weighted breakdown, and failure tags.
-- ============================================================

-- New dimension scores
ALTER TABLE app.ai_conversation_analysis
  ADD COLUMN IF NOT EXISTS score_investigation       smallint CHECK (score_investigation BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS score_commercial_steering smallint CHECK (score_commercial_steering BETWEEN 0 AND 10);

-- Structured analysis JSONB (holds all v3-enhanced blocks)
ALTER TABLE app.ai_conversation_analysis
  ADD COLUMN IF NOT EXISTS structured_analysis       jsonb DEFAULT NULL;

COMMENT ON COLUMN app.ai_conversation_analysis.structured_analysis IS
  'v3-enhanced structured payload: { missed_opportunities, strengths, improvements, diagnosis, pillar_evidence, weighted_breakdown, failure_tags }';

-- GIN index for querying failure_tags inside the JSONB
CREATE INDEX IF NOT EXISTS idx_ai_analysis_failure_tags
  ON app.ai_conversation_analysis
  USING GIN ((structured_analysis -> 'failure_tags'));
