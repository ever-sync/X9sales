-- Migration 00014: Add missing CRUD RLS policies for management

-- ============================================================
-- app.agents: Management policies
-- ============================================================

CREATE POLICY "agents_insert" ON app.agents
    FOR INSERT WITH CHECK (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

CREATE POLICY "agents_update" ON app.agents
    FOR UPDATE USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

CREATE POLICY "agents_delete" ON app.agents
    FOR DELETE USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

-- ============================================================
-- app.teams: Management policies
-- ============================================================

CREATE POLICY "teams_insert" ON app.teams
    FOR INSERT WITH CHECK (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

CREATE POLICY "teams_update" ON app.teams
    FOR UPDATE USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

CREATE POLICY "teams_delete" ON app.teams
    FOR DELETE USING (
        app.has_role_level(auth.uid(), company_id, 'manager')
    );

-- ============================================================
-- app.team_members: Management policies
-- ============================================================

CREATE POLICY "team_members_manage" ON app.team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM app.teams
            WHERE id = team_members.team_id
              AND app.has_role_level(auth.uid(), company_id, 'manager')
        )
    );

-- ============================================================
-- app.customers: Management policies
-- ============================================================

CREATE POLICY "customers_insert" ON app.customers
    FOR INSERT WITH CHECK (
        app.has_role_level(auth.uid(), company_id, 'agent')
    );

CREATE POLICY "customers_update" ON app.customers
    FOR UPDATE USING (
        app.has_role_level(auth.uid(), company_id, 'agent')
    );
