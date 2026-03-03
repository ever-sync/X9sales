-- Migration 00002: Raw schema tables
-- Stores data exactly as received from n8n / external providers

-- ============================================================
-- raw.messages — individual messages from all channels
-- ============================================================
CREATE TABLE raw.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    provider text NOT NULL,
    provider_message_id text NOT NULL,
    conversation_external_id text,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'call', 'chat', 'instagram', 'messenger', 'telegram')),
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type text CHECK (sender_type IN ('agent', 'customer', 'system')),
    agent_external_id text,
    customer_external_id text,
    message_timestamp timestamptz NOT NULL,
    raw_payload jsonb NOT NULL DEFAULT '{}',
    ingested_at timestamptz NOT NULL DEFAULT now(),
    processed boolean NOT NULL DEFAULT false,
    processed_at timestamptz
);

-- Idempotency: same message from same provider can't be inserted twice
ALTER TABLE raw.messages
    ADD CONSTRAINT uq_raw_messages_provider UNIQUE (company_id, provider, provider_message_id);

CREATE INDEX idx_raw_messages_unprocessed
    ON raw.messages (company_id, ingested_at)
    WHERE processed = false;

CREATE INDEX idx_raw_messages_conversation
    ON raw.messages (company_id, conversation_external_id, message_timestamp);

CREATE INDEX idx_raw_messages_agent
    ON raw.messages (company_id, agent_external_id);

-- ============================================================
-- raw.conversations — conversation-level data from providers
-- ============================================================
CREATE TABLE raw.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    provider text NOT NULL,
    conversation_external_id text NOT NULL,
    channel text NOT NULL,
    status text,
    agent_external_id text,
    customer_external_id text,
    customer_name text,
    customer_phone text,
    customer_email text,
    raw_payload jsonb DEFAULT '{}',
    first_message_at timestamptz,
    last_message_at timestamptz,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE raw.conversations
    ADD CONSTRAINT uq_raw_conversations_provider UNIQUE (company_id, provider, conversation_external_id);

CREATE INDEX idx_raw_conversations_company
    ON raw.conversations (company_id, last_message_at DESC);

-- ============================================================
-- raw.calls — phone call records
-- ============================================================
CREATE TABLE raw.calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    provider text NOT NULL,
    provider_call_id text NOT NULL,
    agent_external_id text,
    customer_external_id text,
    direction text CHECK (direction IN ('inbound', 'outbound')),
    status text CHECK (status IN ('completed', 'missed', 'abandoned', 'busy', 'no_answer')),
    duration_seconds integer,
    recording_url text,
    call_timestamp timestamptz NOT NULL,
    raw_payload jsonb DEFAULT '{}',
    ingested_at timestamptz NOT NULL DEFAULT now(),
    processed boolean NOT NULL DEFAULT false,
    processed_at timestamptz
);

ALTER TABLE raw.calls
    ADD CONSTRAINT uq_raw_calls_provider UNIQUE (company_id, provider, provider_call_id);

CREATE INDEX idx_raw_calls_unprocessed
    ON raw.calls (company_id, ingested_at)
    WHERE processed = false;

-- ============================================================
-- raw.deals — CRM deal/opportunity data
-- ============================================================
CREATE TABLE raw.deals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    provider text NOT NULL,
    deal_external_id text NOT NULL,
    stage text,
    status text CHECK (status IN ('open', 'won', 'lost')),
    value numeric(12, 2),
    agent_external_id text,
    customer_external_id text,
    customer_name text,
    raw_payload jsonb DEFAULT '{}',
    ingested_at timestamptz NOT NULL DEFAULT now(),
    processed boolean NOT NULL DEFAULT false,
    processed_at timestamptz
);

ALTER TABLE raw.deals
    ADD CONSTRAINT uq_raw_deals_provider UNIQUE (company_id, provider, deal_external_id);

CREATE INDEX idx_raw_deals_unprocessed
    ON raw.deals (company_id, ingested_at)
    WHERE processed = false;

-- ============================================================
-- raw.processing_errors — dead-letter for failed processing
-- ============================================================
CREATE TABLE raw.processing_errors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid,
    source_table text NOT NULL,
    source_id uuid,
    error_message text NOT NULL,
    error_stack text,
    retry_count integer NOT NULL DEFAULT 0,
    resolved boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX idx_raw_processing_errors_unresolved
    ON raw.processing_errors (company_id, source_table, created_at)
    WHERE resolved = false;

-- Grant table access to service_role
GRANT ALL ON ALL TABLES IN SCHEMA raw TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA raw TO service_role;
