-- Migration 00004: RLS policies + helper functions
-- Implements RBAC: owner_admin > manager > qa_reviewer > agent

-- ============================================================
-- Helper functions
-- ============================================================

-- Get user's role in a company
CREATE OR REPLACE FUNCTION app.get_member_role(p_user_id uuid, p_company_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
    SELECT role FROM app.company_members
    WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND is_active = true
    LIMIT 1;
$$;

-- Get the agent_id linked to a user in a company
CREATE OR REPLACE FUNCTION app.get_user_agent_id(p_user_id uuid, p_company_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
    SELECT a.id FROM app.agents a
    JOIN app.company_members cm ON cm.id = a.member_id
    WHERE cm.user_id = p_user_id
      AND cm.company_id = p_company_id
      AND cm.is_active = true
    LIMIT 1;
$$;

-- Get company_ids the user belongs to
CREATE OR REPLACE FUNCTION app.get_user_company_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
    SELECT company_id FROM app.company_members
    WHERE user_id = p_user_id AND is_active = true;
$$;

-- Check if user has at least a given role level
CREATE OR REPLACE FUNCTION app.has_role_level(p_user_id uuid, p_company_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
DECLARE
    v_role text;
    v_levels jsonb := '{"owner_admin": 90, "manager": 70, "qa_reviewer": 50, "agent": 30}'::jsonb;
BEGIN
    SELECT role INTO v_role FROM app.company_members
    WHERE user_id = p_user_id AND company_id = p_company_id AND is_active = true;

    IF v_role IS NULL THEN RETURN false; END IF;

    RETURN (v_levels->>v_role)::int >= (v_levels->>p_min_role)::int;
END;
$$;

-- Get agent_ids managed by a manager (through teams)
CREATE OR REPLACE FUNCTION app.get_managed_agent_ids(p_user_id uuid, p_company_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
    SELECT DISTINCT a.id
    FROM app.agents a
    JOIN app.team_members tm ON tm.member_id = a.member_id
    JOIN app.teams t ON t.id = tm.team_id
    WHERE t.company_id = p_company_id
      AND t.manager_id = (
          SELECT id FROM app.company_members
          WHERE user_id = p_user_id AND company_id = p_company_id AND is_active = true
      );
$$;

-- ============================================================
-- Enable RLS on all app tables
-- ============================================================
ALTER TABLE app.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_agent_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.qa_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Companies: members can see their own companies
-- ============================================================
CREATE POLICY "companies_select" ON app.companies
    FOR SELECT USING (
        id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

-- ============================================================
-- Company members: see members of your company
-- ============================================================
CREATE POLICY "company_members_select" ON app.company_members
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

-- ============================================================
-- Teams: see teams in your company
-- ============================================================
CREATE POLICY "teams_select" ON app.teams
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

-- ============================================================
-- Team members: see team members in your company's teams
-- ============================================================
CREATE POLICY "team_members_select" ON app.team_members
    FOR SELECT USING (
        team_id IN (
            SELECT id FROM app.teams
            WHERE company_id IN (SELECT app.get_user_company_ids(auth.uid()))
        )
    );

-- ============================================================
-- Agents: see agents in your company
-- ============================================================
CREATE POLICY "agents_select" ON app.agents
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

-- ============================================================
-- Customers: see customers in your company
-- ============================================================
CREATE POLICY "customers_select" ON app.customers
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

-- ============================================================
-- Conversations: RBAC-filtered
--   owner_admin / qa_reviewer: see all in company
--   manager: see team's conversations
--   agent: see only own conversations
-- ============================================================
CREATE POLICY "conversations_select" ON app.conversations
    FOR SELECT USING (
        CASE app.get_member_role(auth.uid(), company_id)
            WHEN 'owner_admin' THEN true
            WHEN 'qa_reviewer' THEN true
            WHEN 'manager' THEN
                agent_id IN (SELECT app.get_managed_agent_ids(auth.uid(), company_id))
                OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
            WHEN 'agent' THEN
                agent_id = app.get_user_agent_id(auth.uid(), company_id)
            ELSE false
        END
    );

-- ============================================================
-- Events: same RBAC as conversations
-- ============================================================
CREATE POLICY "events_select" ON app.events
    FOR SELECT USING (
        CASE app.get_member_role(auth.uid(), company_id)
            WHEN 'owner_admin' THEN true
            WHEN 'qa_reviewer' THEN true
            WHEN 'manager' THEN
                agent_id IN (SELECT app.get_managed_agent_ids(auth.uid(), company_id))
                OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
            WHEN 'agent' THEN
                agent_id = app.get_user_agent_id(auth.uid(), company_id)
            ELSE false
        END
    );

-- ============================================================
-- Metrics conversation: same RBAC as conversations
-- ============================================================
CREATE POLICY "metrics_conversation_select" ON app.metrics_conversation
    FOR SELECT USING (
        CASE app.get_member_role(auth.uid(), company_id)
            WHEN 'owner_admin' THEN true
            WHEN 'qa_reviewer' THEN true
            WHEN 'manager' THEN
                agent_id IN (SELECT app.get_managed_agent_ids(auth.uid(), company_id))
                OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
            WHEN 'agent' THEN
                agent_id = app.get_user_agent_id(auth.uid(), company_id)
            ELSE false
        END
    );

-- ============================================================
-- Metrics agent daily: same RBAC pattern
-- ============================================================
CREATE POLICY "metrics_agent_daily_select" ON app.metrics_agent_daily
    FOR SELECT USING (
        CASE app.get_member_role(auth.uid(), company_id)
            WHEN 'owner_admin' THEN true
            WHEN 'qa_reviewer' THEN true
            WHEN 'manager' THEN
                agent_id IN (SELECT app.get_managed_agent_ids(auth.uid(), company_id))
                OR agent_id = app.get_user_agent_id(auth.uid(), company_id)
            WHEN 'agent' THEN
                agent_id = app.get_user_agent_id(auth.uid(), company_id)
            ELSE false
        END
    );

-- ============================================================
-- QA Reviews: owner_admin + qa_reviewer can see/create
-- ============================================================
CREATE POLICY "qa_reviews_select" ON app.qa_reviews
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'qa_reviewer')
    );

CREATE POLICY "qa_reviews_insert" ON app.qa_reviews
    FOR INSERT WITH CHECK (
        app.get_member_role(auth.uid(), company_id) IN ('owner_admin', 'qa_reviewer')
    );

CREATE POLICY "qa_reviews_update" ON app.qa_reviews
    FOR UPDATE USING (
        reviewer_id = (
            SELECT id FROM app.company_members
            WHERE user_id = auth.uid() AND company_id = qa_reviews.company_id
        )
    );

-- ============================================================
-- Alerts: manager+ can see
-- ============================================================
CREATE POLICY "alerts_select" ON app.alerts
    FOR SELECT USING (
        app.has_role_level(auth.uid(), company_id, 'agent')
    );

CREATE POLICY "alerts_update" ON app.alerts
    FOR UPDATE USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

-- ============================================================
-- Audit logs: owner_admin only
-- ============================================================
CREATE POLICY "audit_logs_select" ON app.audit_logs
    FOR SELECT USING (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    );

-- ============================================================
-- INSERT/UPDATE policies for service_role (scanner writes)
-- service_role bypasses RLS by default, so these are for
-- authenticated users who need write access
-- ============================================================

-- Company members: owner_admin can manage
CREATE POLICY "company_members_manage" ON app.company_members
    FOR ALL USING (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    );

-- Alerts: anyone can acknowledge their own
CREATE POLICY "alerts_acknowledge" ON app.alerts
    FOR UPDATE USING (
        agent_id = app.get_user_agent_id(auth.uid(), company_id)
        AND status = 'open'
    ) WITH CHECK (
        status = 'acknowledged'
    );
