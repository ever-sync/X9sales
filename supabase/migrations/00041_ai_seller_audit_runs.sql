-- Canonical monthly seller audit runs for manager-grade AI reporting

CREATE TABLE app.ai_seller_audit_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    company_timezone text NOT NULL,
    source text NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'ai_analysis_auto', 'manager_copilot')),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    total_conversations integer NOT NULL DEFAULT 0 CHECK (total_conversations >= 0),
    processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    analyzed_count integer NOT NULL DEFAULT 0 CHECK (analyzed_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    report_markdown text,
    prompt_version text NOT NULL DEFAULT 'v1-manager-hard',
    model_used text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_seller_audit_runs_period
        CHECK (period_end >= period_start AND (period_end - period_start) <= 365)
);

CREATE INDEX idx_ai_seller_audit_runs_company_agent_created
    ON app.ai_seller_audit_runs (company_id, agent_id, created_at DESC);

CREATE INDEX idx_ai_seller_audit_runs_status_created
    ON app.ai_seller_audit_runs (status, created_at);

CREATE INDEX idx_ai_seller_audit_runs_period_lookup
    ON app.ai_seller_audit_runs (company_id, agent_id, period_start, period_end, prompt_version, created_at DESC);

CREATE TRIGGER set_updated_at_ai_seller_audit_runs
    BEFORE UPDATE ON app.ai_seller_audit_runs
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.ai_seller_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_seller_audit_runs_select_qa"
    ON app.ai_seller_audit_runs
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE OR REPLACE FUNCTION app.dequeue_ai_seller_audit_run()
RETURNS app.ai_seller_audit_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_job app.ai_seller_audit_runs;
BEGIN
    SELECT *
      INTO v_job
      FROM app.ai_seller_audit_runs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE app.ai_seller_audit_runs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

GRANT SELECT ON app.ai_seller_audit_runs TO authenticated;
GRANT ALL ON app.ai_seller_audit_runs TO service_role;

REVOKE ALL ON FUNCTION app.dequeue_ai_seller_audit_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dequeue_ai_seller_audit_run() TO service_role;
