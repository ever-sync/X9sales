-- Migration 00007: AI analysis and spam detection tables

-- ============================================================
-- app.spam_risk_events — WhatsApp spam pattern detection
-- ============================================================
CREATE TABLE app.spam_risk_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    agent_id                uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,

    detected_at             timestamptz NOT NULL DEFAULT now(),
    window_start            timestamptz NOT NULL,
    window_end              timestamptz NOT NULL,

    pattern_type            text NOT NULL CHECK (pattern_type IN ('identical_message', 'near_identical_message', 'burst_volume')),
    identical_message_hash  text,
    message_sample          text,
    recipient_count         integer NOT NULL,
    occurrence_count        integer NOT NULL,

    risk_level              text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    alert_id                uuid REFERENCES app.alerts(id) ON DELETE SET NULL,

    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_spam_risk_company ON app.spam_risk_events (company_id, detected_at DESC);
CREATE INDEX idx_spam_risk_agent   ON app.spam_risk_events (agent_id, detected_at DESC);
CREATE INDEX idx_spam_risk_open    ON app.spam_risk_events (company_id, pattern_type, detected_at DESC);

-- ============================================================
-- app.ai_conversation_analysis — AI quality scores (schema-ready)
-- Will be populated once ANTHROPIC_API_KEY is configured
-- ============================================================
CREATE TABLE app.ai_conversation_analysis (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id             uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id                    uuid REFERENCES app.agents(id),

    -- Overall quality score (0-100)
    quality_score               smallint CHECK (quality_score BETWEEN 0 AND 100),

    -- Customer handling dimensions (0-10 each)
    score_empathy               smallint CHECK (score_empathy BETWEEN 0 AND 10),
    score_professionalism       smallint CHECK (score_professionalism BETWEEN 0 AND 10),
    score_conflict_resolution   smallint CHECK (score_conflict_resolution BETWEEN 0 AND 10),
    score_clarity               smallint CHECK (score_clarity BETWEEN 0 AND 10),

    -- Sales technique dimensions (0-10 each, NULL if not a sales conversation)
    score_rapport               smallint CHECK (score_rapport BETWEEN 0 AND 10),
    score_urgency               smallint CHECK (score_urgency BETWEEN 0 AND 10),
    score_value_proposition     smallint CHECK (score_value_proposition BETWEEN 0 AND 10),
    score_objection_handling    smallint CHECK (score_objection_handling BETWEEN 0 AND 10),

    -- Detected technique flags
    used_rapport                boolean,
    used_urgency                boolean,
    used_value_proposition      boolean,
    used_objection_handling     boolean,
    is_sales_conversation       boolean NOT NULL DEFAULT false,

    -- Training / coaching output
    needs_coaching              boolean NOT NULL DEFAULT false,
    coaching_tips               text[],
    training_tags               text[],

    -- AI metadata
    model_used                  text NOT NULL DEFAULT 'claude-haiku-4-5',
    prompt_version              text NOT NULL DEFAULT 'v1',
    raw_ai_response             jsonb,
    analyzed_at                 timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.ai_conversation_analysis
    ADD CONSTRAINT uq_ai_analysis_conversation UNIQUE (conversation_id);

CREATE INDEX idx_ai_analysis_company  ON app.ai_conversation_analysis (company_id, analyzed_at DESC);
CREATE INDEX idx_ai_analysis_agent    ON app.ai_conversation_analysis (agent_id, analyzed_at DESC);
CREATE INDEX idx_ai_analysis_score    ON app.ai_conversation_analysis (company_id, quality_score DESC NULLS LAST);
CREATE INDEX idx_ai_analysis_coaching ON app.ai_conversation_analysis (company_id, needs_coaching)
    WHERE needs_coaching = true;

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE app.spam_risk_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_conversation_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: spam_risk_events — manager+ can see
-- ============================================================
CREATE POLICY "spam_risk_select" ON app.spam_risk_events
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

-- ============================================================
-- RLS: ai_conversation_analysis
--   qa_reviewer+ see all rows
--   agents see only their own rows
-- ============================================================
CREATE POLICY "ai_analysis_select_qa" ON app.ai_conversation_analysis
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
    );

CREATE POLICY "ai_analysis_select_agent" ON app.ai_conversation_analysis
    FOR SELECT USING (
        agent_id = app.get_user_agent_id(auth.uid(), company_id)
    );

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT ON app.spam_risk_events TO authenticated;
GRANT SELECT ON app.ai_conversation_analysis TO authenticated;
GRANT ALL ON app.spam_risk_events TO service_role;
GRANT ALL ON app.ai_conversation_analysis TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO authenticated;
