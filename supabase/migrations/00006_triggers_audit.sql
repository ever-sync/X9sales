-- Migration 00006: Audit triggers + utility functions

-- ============================================================
-- Generic audit log trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION app.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_company_id uuid;
    v_action text;
    v_details jsonb;
BEGIN
    -- Determine action
    v_action := TG_OP;

    -- Get company_id from the row
    IF TG_OP = 'DELETE' THEN
        v_company_id := OLD.company_id;
        v_details := jsonb_build_object('old', to_jsonb(OLD));
    ELSIF TG_OP = 'INSERT' THEN
        v_company_id := NEW.company_id;
        v_details := jsonb_build_object('new', to_jsonb(NEW));
    ELSE
        v_company_id := NEW.company_id;
        v_details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    END IF;

    INSERT INTO app.audit_logs (company_id, user_id, action, resource_type, resource_id, details)
    VALUES (
        v_company_id,
        auth.uid(),
        v_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_details
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- Apply audit triggers to key tables
-- ============================================================
CREATE TRIGGER audit_qa_reviews
    AFTER INSERT OR UPDATE OR DELETE ON app.qa_reviews
    FOR EACH ROW EXECUTE FUNCTION app.audit_log_trigger();

CREATE TRIGGER audit_alerts
    AFTER UPDATE ON app.alerts
    FOR EACH ROW EXECUTE FUNCTION app.audit_log_trigger();

CREATE TRIGGER audit_company_members
    AFTER INSERT OR UPDATE OR DELETE ON app.company_members
    FOR EACH ROW EXECUTE FUNCTION app.audit_log_trigger();

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at_companies
    BEFORE UPDATE ON app.companies
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER set_updated_at_company_members
    BEFORE UPDATE ON app.company_members
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER set_updated_at_agents
    BEFORE UPDATE ON app.agents
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER set_updated_at_customers
    BEFORE UPDATE ON app.customers
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER set_updated_at_conversations
    BEFORE UPDATE ON app.conversations
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER set_updated_at_qa_reviews
    BEFORE UPDATE ON app.qa_reviews
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- Ingest message function (called by n8n via RPC)
-- Handles idempotency via ON CONFLICT
-- ============================================================
CREATE OR REPLACE FUNCTION raw.ingest_message(
    p_company_id uuid,
    p_provider text,
    p_provider_message_id text,
    p_conversation_external_id text,
    p_channel text,
    p_direction text,
    p_sender_type text DEFAULT NULL,
    p_agent_external_id text DEFAULT NULL,
    p_customer_external_id text DEFAULT NULL,
    p_message_timestamp timestamptz DEFAULT now(),
    p_raw_payload jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raw
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO raw.messages (
        company_id, provider, provider_message_id, conversation_external_id,
        channel, direction, sender_type, agent_external_id, customer_external_id,
        message_timestamp, raw_payload
    ) VALUES (
        p_company_id, p_provider, p_provider_message_id, p_conversation_external_id,
        p_channel, p_direction, p_sender_type, p_agent_external_id, p_customer_external_id,
        p_message_timestamp, p_raw_payload
    )
    ON CONFLICT (company_id, provider, provider_message_id) DO NOTHING
    RETURNING id INTO v_id;

    -- Also upsert the conversation
    IF p_conversation_external_id IS NOT NULL THEN
        INSERT INTO raw.conversations (
            company_id, provider, conversation_external_id, channel,
            agent_external_id, customer_external_id,
            first_message_at, last_message_at
        ) VALUES (
            p_company_id, p_provider, p_conversation_external_id, p_channel,
            p_agent_external_id, p_customer_external_id,
            p_message_timestamp, p_message_timestamp
        )
        ON CONFLICT (company_id, provider, conversation_external_id)
        DO UPDATE SET
            last_message_at = GREATEST(raw.conversations.last_message_at, EXCLUDED.last_message_at),
            agent_external_id = COALESCE(EXCLUDED.agent_external_id, raw.conversations.agent_external_id),
            customer_external_id = COALESCE(EXCLUDED.customer_external_id, raw.conversations.customer_external_id),
            updated_at = now();
    END IF;

    RETURN v_id;
END;
$$;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION raw.ingest_message TO service_role;
GRANT EXECUTE ON FUNCTION app.refresh_dashboard_views TO service_role;
GRANT EXECUTE ON FUNCTION app.get_member_role TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_user_agent_id TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_user_company_ids TO authenticated;
GRANT EXECUTE ON FUNCTION app.has_role_level TO authenticated;

-- ============================================================
-- Cleanup function for old audit logs (retention: 90 days)
-- ============================================================
CREATE OR REPLACE FUNCTION app.cleanup_old_audit_logs(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
    v_count integer;
BEGIN
    DELETE FROM app.audit_logs
    WHERE created_at < now() - (p_days || ' days')::interval;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
