-- Migration 00020: Enable RLS on app.messages
-- ============================================================
-- Fix: app.messages was created in 00009 WITHOUT RLS,
-- causing frontend queries to return empty results.
-- ============================================================

ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;

-- SELECT: same RBAC as conversations (via conversation's company_id + agent_id)
CREATE POLICY "messages_select" ON app.messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM app.conversations c
            WHERE CASE app.get_member_role(auth.uid(), c.company_id)
                WHEN 'owner_admin' THEN true
                WHEN 'qa_reviewer' THEN true
                WHEN 'manager' THEN
                    c.agent_id IN (SELECT app.get_managed_agent_ids(auth.uid(), c.company_id))
                    OR c.agent_id = app.get_user_agent_id(auth.uid(), c.company_id)
                WHEN 'agent' THEN
                    c.agent_id = app.get_user_agent_id(auth.uid(), c.company_id)
                ELSE false
            END
        )
    );

-- INSERT: service_role only (scanner). No authenticated INSERT needed.
-- service_role bypasses RLS, so no explicit policy required.
