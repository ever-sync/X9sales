-- Migration 00023: Manager Copilot floating chat and deep feedback jobs

-- ============================================================
-- app.manager_copilot_threads
-- ============================================================
CREATE TABLE app.manager_copilot_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'Copilot do Gestor',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manager_copilot_threads_company_created
    ON app.manager_copilot_threads (company_id, created_at DESC);

CREATE INDEX idx_manager_copilot_threads_user_created
    ON app.manager_copilot_threads (user_id, created_at DESC);

CREATE TRIGGER set_updated_at_manager_copilot_threads
    BEFORE UPDATE ON app.manager_copilot_threads
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.manager_copilot_messages
-- ============================================================
CREATE TABLE app.manager_copilot_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES app.manager_copilot_threads(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content_md text NOT NULL,
    status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'pending', 'error')),
    sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manager_copilot_messages_company_created
    ON app.manager_copilot_messages (company_id, created_at DESC);

CREATE INDEX idx_manager_copilot_messages_thread_created
    ON app.manager_copilot_messages (thread_id, created_at);

-- ============================================================
-- app.manager_feedback_jobs
-- ============================================================
CREATE TABLE app.manager_feedback_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES app.manager_copilot_threads(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    company_timezone text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    total_conversations integer NOT NULL DEFAULT 0 CHECK (total_conversations >= 0),
    processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    quick_answer_message_id uuid REFERENCES app.manager_copilot_messages(id) ON DELETE SET NULL,
    final_answer_message_id uuid REFERENCES app.manager_copilot_messages(id) ON DELETE SET NULL,
    result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_manager_feedback_jobs_period
        CHECK (period_end >= period_start AND (period_end - period_start) <= 365)
);

CREATE INDEX idx_manager_feedback_jobs_company_created
    ON app.manager_feedback_jobs (company_id, created_at DESC);

CREATE INDEX idx_manager_feedback_jobs_status_created
    ON app.manager_feedback_jobs (status, created_at);

CREATE INDEX idx_manager_feedback_jobs_thread_created
    ON app.manager_feedback_jobs (thread_id, created_at DESC);

CREATE TRIGGER set_updated_at_manager_feedback_jobs
    BEFORE UPDATE ON app.manager_feedback_jobs
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE app.manager_copilot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.manager_copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.manager_feedback_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_copilot_threads_select_qa"
    ON app.manager_copilot_threads
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE POLICY "manager_copilot_threads_insert_qa"
    ON app.manager_copilot_threads
    FOR INSERT
    WITH CHECK (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
        AND user_id = auth.uid()
    );

CREATE POLICY "manager_copilot_threads_update_qa"
    ON app.manager_copilot_threads
    FOR UPDATE
    USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
        AND user_id = auth.uid()
    );

CREATE POLICY "manager_copilot_messages_select_qa"
    ON app.manager_copilot_messages
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE POLICY "manager_copilot_messages_insert_qa"
    ON app.manager_copilot_messages
    FOR INSERT
    WITH CHECK (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE POLICY "manager_feedback_jobs_select_qa"
    ON app.manager_feedback_jobs
    FOR SELECT
    USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

-- ============================================================
-- Functions
-- ============================================================
CREATE OR REPLACE FUNCTION app.mask_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_digits text;
    v_len int;
BEGIN
    IF p_phone IS NULL OR btrim(p_phone) = '' THEN
        RETURN NULL;
    END IF;

    v_digits := regexp_replace(p_phone, '\D', '', 'g');
    v_len := length(v_digits);

    IF v_len <= 4 THEN
        RETURN repeat('*', v_len);
    END IF;

    RETURN left(v_digits, 4) || repeat('*', GREATEST(v_len - 6, 2)) || right(v_digits, 2);
END;
$$;

CREATE OR REPLACE FUNCTION app.dequeue_manager_feedback_job()
RETURNS app.manager_feedback_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_job app.manager_feedback_jobs;
BEGIN
    SELECT *
      INTO v_job
      FROM app.manager_feedback_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE app.manager_feedback_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_manager_feedback_conversations(
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
GRANT SELECT, INSERT, UPDATE ON app.manager_copilot_threads TO authenticated;
GRANT SELECT, INSERT ON app.manager_copilot_messages TO authenticated;
GRANT SELECT ON app.manager_feedback_jobs TO authenticated;

GRANT ALL ON app.manager_copilot_threads TO service_role;
GRANT ALL ON app.manager_copilot_messages TO service_role;
GRANT ALL ON app.manager_feedback_jobs TO service_role;

REVOKE ALL ON FUNCTION app.mask_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mask_phone(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.dequeue_manager_feedback_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dequeue_manager_feedback_job() TO service_role;

REVOKE ALL ON FUNCTION app.get_manager_feedback_conversations(uuid, uuid, date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_manager_feedback_conversations(uuid, uuid, date, date, text, integer) TO service_role;
