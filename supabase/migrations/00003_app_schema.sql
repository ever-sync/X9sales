-- Migration 00003: App schema tables
-- Normalized, dashboard-ready data

-- ============================================================
-- app.companies — multi-tenant root
-- ============================================================
CREATE TABLE app.companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE,
    settings jsonb NOT NULL DEFAULT '{
        "sla_first_response_sec": 300,
        "sla_resolution_sec": 86400,
        "timezone": "America/Sao_Paulo",
        "working_hours_start": "08:00",
        "working_hours_end": "18:00",
        "working_days": [1,2,3,4,5]
    }',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- app.company_members — RBAC: links auth.users to companies
-- ============================================================
CREATE TABLE app.company_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner_admin', 'manager', 'agent', 'qa_reviewer')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.company_members
    ADD CONSTRAINT uq_company_members UNIQUE (company_id, user_id);

CREATE INDEX idx_company_members_user ON app.company_members (user_id, company_id) WHERE is_active = true;

-- ============================================================
-- app.teams — groups of agents under a manager
-- ============================================================
CREATE TABLE app.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    name text NOT NULL,
    manager_id uuid REFERENCES app.company_members(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_company ON app.teams (company_id);

-- ============================================================
-- app.team_members — many-to-many: members in teams
-- ============================================================
CREATE TABLE app.team_members (
    team_id uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES app.company_members(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, member_id)
);

-- ============================================================
-- app.agents — mapped agents (linked to external systems)
-- ============================================================
CREATE TABLE app.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    member_id uuid REFERENCES app.company_members(id),
    external_id text,
    name text NOT NULL,
    email text,
    phone text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.agents
    ADD CONSTRAINT uq_agents_external UNIQUE (company_id, external_id);

CREATE INDEX idx_agents_company ON app.agents (company_id) WHERE is_active = true;
CREATE INDEX idx_agents_member ON app.agents (member_id) WHERE member_id IS NOT NULL;

-- ============================================================
-- app.customers — normalized customer records
-- ============================================================
CREATE TABLE app.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    external_id text,
    name text,
    phone text,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.customers
    ADD CONSTRAINT uq_customers_external UNIQUE (company_id, external_id);

CREATE INDEX idx_customers_company ON app.customers (company_id);

-- ============================================================
-- app.conversations — normalized conversations
-- ============================================================
CREATE TABLE app.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    raw_conversation_id uuid,
    agent_id uuid REFERENCES app.agents(id),
    customer_id uuid REFERENCES app.customers(id),
    channel text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'waiting', 'snoozed')),
    started_at timestamptz,
    closed_at timestamptz,
    message_count_in integer NOT NULL DEFAULT 0,
    message_count_out integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_company ON app.conversations (company_id, started_at DESC);
CREATE INDEX idx_conversations_agent ON app.conversations (agent_id, started_at DESC);
CREATE INDEX idx_conversations_status ON app.conversations (company_id, status);
CREATE INDEX idx_conversations_raw ON app.conversations (raw_conversation_id) WHERE raw_conversation_id IS NOT NULL;

-- ============================================================
-- app.events — normalized events (funnel, SLA, actions)
-- ============================================================
CREATE TABLE app.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    conversation_id uuid REFERENCES app.conversations(id),
    agent_id uuid REFERENCES app.agents(id),
    customer_id uuid REFERENCES app.customers(id),
    event_timestamp timestamptz NOT NULL,
    meta jsonb NOT NULL DEFAULT '{}',
    source_raw_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: same event from same raw source can't be created twice
ALTER TABLE app.events
    ADD CONSTRAINT uq_events_source UNIQUE (company_id, event_type, source_raw_id);

CREATE INDEX idx_events_company_type ON app.events (company_id, event_type, event_timestamp DESC);
CREATE INDEX idx_events_conversation ON app.events (conversation_id, event_timestamp);
CREATE INDEX idx_events_agent ON app.events (agent_id, event_timestamp DESC);

-- ============================================================
-- app.metrics_conversation — per-conversation metrics
-- ============================================================
CREATE TABLE app.metrics_conversation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES app.agents(id),
    first_response_time_sec integer,
    resolution_time_sec integer,
    message_count_in integer NOT NULL DEFAULT 0,
    message_count_out integer NOT NULL DEFAULT 0,
    avg_response_gap_sec integer,
    sla_first_response_met boolean,
    sla_resolution_met boolean,
    channel text,
    conversation_date date,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.metrics_conversation
    ADD CONSTRAINT uq_metrics_conversation UNIQUE (conversation_id);

CREATE INDEX idx_metrics_conv_company ON app.metrics_conversation (company_id, conversation_date DESC);
CREATE INDEX idx_metrics_conv_agent ON app.metrics_conversation (agent_id, conversation_date DESC);
CREATE INDEX idx_metrics_conv_sla ON app.metrics_conversation (company_id, sla_first_response_met, conversation_date);

-- ============================================================
-- app.metrics_agent_daily — daily agent rollup
-- ============================================================
CREATE TABLE app.metrics_agent_daily (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    metric_date date NOT NULL,
    conversations_total integer NOT NULL DEFAULT 0,
    conversations_closed integer NOT NULL DEFAULT 0,
    avg_first_response_sec integer,
    avg_resolution_sec integer,
    sla_first_response_pct numeric(5, 2),
    sla_resolution_pct numeric(5, 2),
    messages_sent integer NOT NULL DEFAULT 0,
    messages_received integer NOT NULL DEFAULT 0,
    deals_won integer NOT NULL DEFAULT 0,
    deals_lost integer NOT NULL DEFAULT 0,
    revenue numeric(12, 2) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.metrics_agent_daily
    ADD CONSTRAINT uq_metrics_agent_daily UNIQUE (company_id, agent_id, metric_date);

CREATE INDEX idx_metrics_daily_company ON app.metrics_agent_daily (company_id, metric_date DESC);
CREATE INDEX idx_metrics_daily_agent ON app.metrics_agent_daily (agent_id, metric_date DESC);

-- ============================================================
-- app.qa_reviews — QA audit reviews
-- ============================================================
CREATE TABLE app.qa_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES app.conversations(id),
    reviewer_id uuid NOT NULL REFERENCES app.company_members(id),
    score integer CHECK (score >= 0 AND score <= 100),
    checklist jsonb DEFAULT '[]',
    tags text[] DEFAULT '{}',
    comments text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_reviews_company ON app.qa_reviews (company_id, created_at DESC);
CREATE INDEX idx_qa_reviews_conversation ON app.qa_reviews (conversation_id);

-- ============================================================
-- app.alerts — system and SLA alerts
-- ============================================================
CREATE TABLE app.alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    alert_type text NOT NULL,
    severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'closed')),
    title text NOT NULL,
    description text,
    reference_type text,
    reference_id uuid,
    agent_id uuid REFERENCES app.agents(id),
    meta jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz
);

CREATE INDEX idx_alerts_company_open ON app.alerts (company_id, created_at DESC) WHERE status = 'open';
CREATE INDEX idx_alerts_agent ON app.alerts (agent_id, created_at DESC);

-- ============================================================
-- app.audit_logs — who did what, when
-- ============================================================
CREATE TABLE app.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    resource_type text,
    resource_id uuid,
    details jsonb DEFAULT '{}',
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_company ON app.audit_logs (company_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON app.audit_logs (user_id, created_at DESC);

-- ============================================================
-- app.processing_watermarks — scanner cursor tracking
-- ============================================================
CREATE TABLE app.processing_watermarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    source_table text NOT NULL,
    last_processed_at timestamptz,
    last_processed_id uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.processing_watermarks
    ADD CONSTRAINT uq_watermarks UNIQUE (company_id, source_table);

-- Grant table access
GRANT SELECT ON ALL TABLES IN SCHEMA app TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO authenticated;
