-- Migration 00009: Normalized app.messages table
-- ============================================================
-- app.messages — Individual messages within a conversation
-- ============================================================
CREATE TABLE app.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    sender_type text NOT NULL CHECK (sender_type IN ('agent', 'customer', 'system', 'bot')),
    sender_id text, -- external id or agent_id/customer_id
    content text NOT NULL,
    content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'document', 'interactive')),
    external_message_id text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_company ON app.messages (company_id);
CREATE INDEX idx_messages_conversation ON app.messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_external ON app.messages (external_message_id) WHERE external_message_id IS NOT NULL;

GRANT SELECT ON app.messages TO authenticated;
GRANT ALL ON app.messages TO service_role;
