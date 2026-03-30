-- Canonical strategic product intelligence runs for owner/manager reporting

CREATE TABLE app.product_intelligence_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    company_timezone text NOT NULL,
    source text NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual')),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    total_conversations integer NOT NULL DEFAULT 0 CHECK (total_conversations >= 0),
    processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    analyzed_count integer NOT NULL DEFAULT 0 CHECK (analyzed_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    report_markdown text,
    prompt_version text NOT NULL DEFAULT 'v1-product-market-intel',
    model_used text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_product_intelligence_runs_period
        CHECK (period_end >= period_start AND (period_end - period_start) <= 365)
);

CREATE INDEX idx_product_intelligence_runs_company_created
    ON app.product_intelligence_runs (company_id, created_at DESC);

CREATE INDEX idx_product_intelligence_runs_status_created
    ON app.product_intelligence_runs (status, created_at);

CREATE INDEX idx_product_intelligence_runs_period_lookup
    ON app.product_intelligence_runs (company_id, period_start, period_end, prompt_version, created_at DESC);

CREATE TRIGGER set_updated_at_product_intelligence_runs
    BEFORE UPDATE ON app.product_intelligence_runs
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.product_intelligence_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_intelligence_runs_select_qa"
    ON app.product_intelligence_runs
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE OR REPLACE FUNCTION app.dequeue_product_intelligence_run()
RETURNS app.product_intelligence_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_job app.product_intelligence_runs;
BEGIN
    SELECT *
      INTO v_job
      FROM app.product_intelligence_runs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE app.product_intelligence_runs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_product_intelligence_conversations(
    p_company_id uuid,
    p_period_start date,
    p_period_end date,
    p_timezone text,
    p_limit integer DEFAULT NULL
)
RETURNS TABLE (
    conversation_id uuid,
    company_id uuid,
    agent_id uuid,
    agent_name text,
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
        a.name AS agent_name,
        c.raw_conversation_id,
        c.started_at,
        c.status,
        cu.name AS customer_name,
        cu.phone AS customer_phone
    FROM app.conversations c
    LEFT JOIN app.customers cu ON cu.id = c.customer_id
    LEFT JOIN app.agents a ON a.id = c.agent_id
    WHERE c.company_id = p_company_id
      AND c.raw_conversation_id IS NOT NULL
      AND c.started_at IS NOT NULL
      AND (c.started_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date
            BETWEEN p_period_start AND p_period_end
    ORDER BY c.started_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END;
$$;

GRANT SELECT ON app.product_intelligence_runs TO authenticated;
GRANT ALL ON app.product_intelligence_runs TO service_role;

REVOKE ALL ON FUNCTION app.dequeue_product_intelligence_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dequeue_product_intelligence_run() TO service_role;

REVOKE ALL ON FUNCTION app.get_product_intelligence_conversations(uuid, date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_product_intelligence_conversations(uuid, date, date, text, integer) TO service_role;
