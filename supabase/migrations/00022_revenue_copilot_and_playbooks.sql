-- Migration 00022: Revenue Copilot, Playbooks, and ROI artifacts

-- ============================================================
-- app.deal_signals
-- ============================================================
CREATE TABLE app.deal_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    stage text NOT NULL CHECK (stage IN ('descoberta', 'proposta', 'objecao', 'fechamento', 'pos_venda')),
    intent_level text NOT NULL CHECK (intent_level IN ('fria', 'morna', 'quente')),
    loss_risk_level text NOT NULL CHECK (loss_risk_level IN ('baixo', 'medio', 'alto')),
    estimated_value numeric(12, 2),
    close_probability smallint CHECK (close_probability BETWEEN 0 AND 100),
    next_best_action text,
    suggested_reply text,
    model_used text NOT NULL DEFAULT 'heuristic-v1',
    prompt_version text NOT NULL DEFAULT 'v1',
    generated_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_deal_signals_conversation UNIQUE (conversation_id)
);

CREATE INDEX idx_deal_signals_company_generated ON app.deal_signals(company_id, generated_at DESC);
CREATE INDEX idx_deal_signals_agent_generated ON app.deal_signals(agent_id, generated_at DESC);

CREATE TRIGGER set_updated_at_deal_signals
    BEFORE UPDATE ON app.deal_signals
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.playbooks
-- ============================================================
CREATE TABLE app.playbooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    name text NOT NULL,
    segment text NOT NULL DEFAULT 'geral',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_playbooks_company_name_version UNIQUE (company_id, name, version)
);

CREATE INDEX idx_playbooks_company_status ON app.playbooks(company_id, status);
CREATE INDEX idx_playbooks_company_segment ON app.playbooks(company_id, segment);

CREATE TRIGGER set_updated_at_playbooks
    BEFORE UPDATE ON app.playbooks
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.playbook_rules
-- ============================================================
CREATE TABLE app.playbook_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id uuid NOT NULL REFERENCES app.playbooks(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    rule_type text NOT NULL CHECK (rule_type IN ('abertura', 'qualificacao', 'valor', 'cta', 'contorno_objecao', 'followup', 'custom')),
    rule_text text NOT NULL,
    weight smallint NOT NULL DEFAULT 10 CHECK (weight BETWEEN 0 AND 100),
    is_required boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_rules_playbook_position ON app.playbook_rules(playbook_id, position, created_at);
CREATE INDEX idx_playbook_rules_company ON app.playbook_rules(company_id, created_at DESC);

CREATE TRIGGER set_updated_at_playbook_rules
    BEFORE UPDATE ON app.playbook_rules
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.coaching_actions
-- ============================================================
CREATE TABLE app.coaching_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    action_type text NOT NULL,
    accepted boolean NOT NULL DEFAULT false,
    applied_at timestamptz,
    impact_score smallint CHECK (impact_score BETWEEN 0 AND 100),
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coaching_actions_company_created ON app.coaching_actions(company_id, created_at DESC);
CREATE INDEX idx_coaching_actions_conversation_created ON app.coaching_actions(conversation_id, created_at DESC);
CREATE INDEX idx_coaching_actions_agent_created ON app.coaching_actions(agent_id, created_at DESC);

-- ============================================================
-- app.revenue_outcomes
-- ============================================================
CREATE TABLE app.revenue_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    outcome text NOT NULL DEFAULT 'open' CHECK (outcome IN ('won', 'lost', 'open')),
    value numeric(12, 2) NOT NULL DEFAULT 0,
    won_at timestamptz,
    loss_reason text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_revenue_outcomes_conversation UNIQUE (conversation_id)
);

CREATE INDEX idx_revenue_outcomes_company_created ON app.revenue_outcomes(company_id, created_at DESC);
CREATE INDEX idx_revenue_outcomes_company_outcome ON app.revenue_outcomes(company_id, outcome, created_at DESC);

CREATE TRIGGER set_updated_at_revenue_outcomes
    BEFORE UPDATE ON app.revenue_outcomes
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.revenue_copilot_jobs
-- ============================================================
CREATE TABLE app.revenue_copilot_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
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
    CONSTRAINT chk_revenue_copilot_jobs_period
        CHECK (period_end >= period_start AND (period_end - period_start) <= 365),
    CONSTRAINT chk_revenue_copilot_jobs_scope_conversation
        CHECK (
            (scope = 'single' AND conversation_id IS NOT NULL) OR
            (scope = 'all' AND conversation_id IS NULL)
        )
);

CREATE INDEX idx_revenue_copilot_jobs_company_created ON app.revenue_copilot_jobs(company_id, created_at DESC);
CREATE INDEX idx_revenue_copilot_jobs_status_created ON app.revenue_copilot_jobs(status, created_at);
CREATE INDEX idx_revenue_copilot_jobs_company_status ON app.revenue_copilot_jobs(company_id, status);

CREATE TRIGGER set_updated_at_revenue_copilot_jobs
    BEFORE UPDATE ON app.revenue_copilot_jobs
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- app.roi_reports
-- ============================================================
CREATE TABLE app.roi_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_roi_reports_period CHECK (period_end >= period_start)
);

CREATE INDEX idx_roi_reports_company_created ON app.roi_reports(company_id, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE app.deal_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.playbook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.coaching_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.revenue_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.revenue_copilot_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.roi_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_signals_select" ON app.deal_signals
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
        OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
    );

CREATE POLICY "playbooks_select" ON app.playbooks
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
        OR (status = 'active' AND app.has_role_level(auth.uid(), company_id, 'agent'))
    );

CREATE POLICY "playbooks_insert_manage" ON app.playbooks
    FOR INSERT WITH CHECK (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "playbooks_update_manage" ON app.playbooks
    FOR UPDATE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "playbooks_delete_manage" ON app.playbooks
    FOR DELETE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "playbook_rules_select" ON app.playbook_rules
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
        OR EXISTS (
            SELECT 1
            FROM app.playbooks p
            WHERE p.id = playbook_id
              AND p.company_id = company_id
              AND p.status = 'active'
              AND app.has_role_level(auth.uid(), company_id, 'agent')
        )
    );

CREATE POLICY "playbook_rules_insert_manage" ON app.playbook_rules
    FOR INSERT WITH CHECK (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "playbook_rules_update_manage" ON app.playbook_rules
    FOR UPDATE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "playbook_rules_delete_manage" ON app.playbook_rules
    FOR DELETE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "coaching_actions_select" ON app.coaching_actions
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
        OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
    );

CREATE POLICY "coaching_actions_insert" ON app.coaching_actions
    FOR INSERT WITH CHECK (app.has_role_level(auth.uid(), company_id, 'agent'));

CREATE POLICY "coaching_actions_update_manage" ON app.coaching_actions
    FOR UPDATE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "revenue_outcomes_select" ON app.revenue_outcomes
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
        OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
    );

CREATE POLICY "revenue_outcomes_insert_manage" ON app.revenue_outcomes
    FOR INSERT WITH CHECK (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "revenue_outcomes_update_manage" ON app.revenue_outcomes
    FOR UPDATE USING (app.has_role_level(auth.uid(), company_id, 'manager'));

CREATE POLICY "revenue_copilot_jobs_select_qa" ON app.revenue_copilot_jobs
    FOR SELECT USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

CREATE POLICY "roi_reports_select_qa" ON app.roi_reports
    FOR SELECT USING (app.has_role_level(auth.uid(), company_id, 'qa_reviewer'));

-- ============================================================
-- Functions
-- ============================================================
CREATE OR REPLACE FUNCTION app.dequeue_revenue_copilot_job()
RETURNS app.revenue_copilot_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_job app.revenue_copilot_jobs;
BEGIN
    SELECT *
      INTO v_job
      FROM app.revenue_copilot_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE app.revenue_copilot_jobs
       SET status = 'running',
           started_at = COALESCE(started_at, now()),
           error_message = NULL,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;

    RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_revenue_copilot_candidates(
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
      AND c.raw_conversation_id IS NOT NULL
      AND c.started_at IS NOT NULL
      AND (p_agent_id IS NULL OR c.agent_id = p_agent_id)
      AND (c.started_at AT TIME ZONE COALESCE(NULLIF(p_timezone, ''), 'UTC'))::date
            BETWEEN p_period_start AND p_period_end
    ORDER BY c.started_at DESC
    LIMIT CASE WHEN p_limit IS NULL OR p_limit < 1 THEN NULL ELSE p_limit END;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT ON app.deal_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.playbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.playbook_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.coaching_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.revenue_outcomes TO authenticated;
GRANT SELECT ON app.revenue_copilot_jobs TO authenticated;
GRANT SELECT ON app.roi_reports TO authenticated;

GRANT ALL ON app.deal_signals TO service_role;
GRANT ALL ON app.playbooks TO service_role;
GRANT ALL ON app.playbook_rules TO service_role;
GRANT ALL ON app.coaching_actions TO service_role;
GRANT ALL ON app.revenue_outcomes TO service_role;
GRANT ALL ON app.revenue_copilot_jobs TO service_role;
GRANT ALL ON app.roi_reports TO service_role;

REVOKE ALL ON FUNCTION app.dequeue_revenue_copilot_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dequeue_revenue_copilot_job() TO service_role;

REVOKE ALL ON FUNCTION app.get_revenue_copilot_candidates(uuid, uuid, date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_revenue_copilot_candidates(uuid, uuid, date, date, text, integer) TO service_role;
