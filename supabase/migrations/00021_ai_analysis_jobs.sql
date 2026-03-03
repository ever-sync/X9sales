-- Migration 00021: Manual AI analysis jobs queue

-- ============================================================
-- app.ai_analysis_jobs
-- ============================================================
CREATE TABLE app.ai_analysis_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    scope text NOT NULL CHECK (scope IN ('single', 'all')),
    conversation_id uuid REFERENCES app.conversations(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    company_timezone text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    total_candidates integer NOT NULL DEFAULT 0 CHECK (total_candidates >= 0),
    processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    analyzed_count integer NOT NULL DEFAULT 0 CHECK (analyzed_count >= 0),
    skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_analysis_jobs_period
        CHECK (period_end >= period_start AND (period_end - period_start) <= 365),
    CONSTRAINT chk_ai_analysis_jobs_scope_conversation
        CHECK (
            (scope = 'single' AND conversation_id IS NOT NULL) OR
            (scope = 'all' AND conversation_id IS NULL)
        )
);

CREATE INDEX idx_ai_analysis_jobs_company_created
    ON app.ai_analysis_jobs (company_id, created_at DESC);

CREATE INDEX idx_ai_analysis_jobs_status_created
    ON app.ai_analysis_jobs (status, created_at);

CREATE INDEX idx_ai_analysis_jobs_company_status
    ON app.ai_analysis_jobs (company_id, status);

-- Keep updated_at current
CREATE TRIGGER set_updated_at_ai_analysis_jobs
    BEFORE UPDATE ON app.ai_analysis_jobs
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE app.ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_jobs_select_qa"
    ON app.ai_analysis_jobs
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

-- ============================================================
-- Functions
-- ============================================================
CREATE OR REPLACE FUNCTION app.dequeue_ai_analysis_job()
RETURNS app.ai_analysis_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_job app.ai_analysis_jobs;
BEGIN
    SELECT *
      INTO v_job
      FROM app.ai_analysis_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE app.ai_analysis_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_ai_analysis_candidates(
    p_company_id uuid,
    p_agent_id uuid,
    p_period_start date,
    p_period_end date,
    p_timezone text,
    p_limit integer DEFAULT NULL
)
RETURNS TABLE (
    conversation_id uuid,
    company_id uuid,
    agent_id uuid,
    raw_conversation_id uuid,
    started_at timestamptz,
    status text,
    customer_name text,
    customer_phone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
    SELECT
        c.id AS conversation_id,
        c.company_id,
        c.agent_id,
        c.raw_conversation_id,
        c.started_at,
        c.status,
        cu.name AS customer_name,
        cu.phone AS customer_phone
    FROM app.conversations c
    LEFT JOIN app.customers cu ON cu.id = c.customer_id
    WHERE c.company_id = p_company_id
      AND c.agent_id = p_agent_id
      AND c.raw_conversation_id IS NOT NULL
      AND c.started_at IS NOT NULL
      AND (c.started_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date
            BETWEEN p_period_start AND p_period_end
    ORDER BY c.started_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT ON app.ai_analysis_jobs TO authenticated;
GRANT ALL ON app.ai_analysis_jobs TO service_role;

REVOKE ALL ON FUNCTION app.dequeue_ai_analysis_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dequeue_ai_analysis_job() TO service_role;

REVOKE ALL ON FUNCTION app.get_ai_analysis_candidates(uuid, uuid, date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_ai_analysis_candidates(uuid, uuid, date, date, text, integer) TO service_role;

