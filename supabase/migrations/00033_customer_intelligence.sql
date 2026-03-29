-- ============================================================
-- 00033 — Customer Intelligence Reports
-- Stores per-conversation AI extraction of customer profile,
-- buying signals, doubts, objections and motivators.
-- ============================================================

CREATE TABLE IF NOT EXISTS app.customer_intelligence_reports (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id         uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id                uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    analyzed_at             timestamptz NOT NULL DEFAULT now(),

    -- Bloco Cliente
    intencao_principal      text,
    estagio_funil           text CHECK (estagio_funil IN ('pesquisando', 'comparando', 'pronto_fechar')),
    nivel_interesse         text CHECK (nivel_interesse IN ('alto', 'medio', 'baixo')),
    sensibilidade_preco     text CHECK (sensibilidade_preco IN ('alta', 'media', 'baixa')),
    urgencia                text CHECK (urgencia IN ('alta', 'media', 'baixa')),
    perfil_comportamental   text CHECK (perfil_comportamental IN ('cauteloso', 'impulsivo', 'analitico')),
    principais_duvidas      text[] NOT NULL DEFAULT '{}',
    principais_objecoes     text[] NOT NULL DEFAULT '{}',
    motivadores_compra      text[] NOT NULL DEFAULT '{}',
    risco_perda             text CHECK (risco_perda IN ('alto', 'medio', 'baixo')),

    -- Bloco Atendimento (extra)
    qualidade_conducao      smallint CHECK (qualidade_conducao BETWEEN 0 AND 100),
    houve_avanco            boolean,
    objecao_tratada         boolean,
    oportunidade_perdida    boolean,

    created_at              timestamptz NOT NULL DEFAULT now(),

    UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_intel_company_analyzed
    ON app.customer_intelligence_reports (company_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_intel_company_agent
    ON app.customer_intelligence_reports (company_id, agent_id, analyzed_at DESC);

-- RLS
ALTER TABLE app.customer_intelligence_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_intel_select" ON app.customer_intelligence_reports;
CREATE POLICY "customer_intel_select" ON app.customer_intelligence_reports
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

DROP POLICY IF EXISTS "customer_intel_service_manage" ON app.customer_intelligence_reports;
CREATE POLICY "customer_intel_service_manage" ON app.customer_intelligence_reports
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON app.customer_intelligence_reports TO authenticated;
GRANT ALL ON app.customer_intelligence_reports TO service_role;
