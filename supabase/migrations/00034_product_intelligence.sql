-- ============================================================
-- 00034 — Product Intelligence Reports
-- Stores per-conversation AI extraction of product interest,
-- comparisons, barriers and understanding difficulties.
-- ============================================================

CREATE TABLE IF NOT EXISTS app.product_intelligence_reports (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  uuid NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
    conversation_id             uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
    agent_id                    uuid REFERENCES app.agents(id) ON DELETE SET NULL,
    analyzed_at                 timestamptz NOT NULL DEFAULT now(),

    -- Bloco Produto
    produto_citado              text,
    produto_interesse           text,
    produtos_comparados         text[] NOT NULL DEFAULT '{}',
    motivo_interesse            text,
    dificuldade_entendimento    text CHECK (dificuldade_entendimento IN ('alto', 'medio', 'baixo')),
    barreiras_produto           text[] NOT NULL DEFAULT '{}',

    -- Bloco Atendimento
    qualidade_conducao          smallint CHECK (qualidade_conducao BETWEEN 0 AND 100),
    houve_avanco                boolean,
    objecao_tratada             boolean,
    oportunidade_perdida        boolean,

    created_at                  timestamptz NOT NULL DEFAULT now(),

    UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_product_intel_company_analyzed
    ON app.product_intelligence_reports (company_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_intel_company_agent
    ON app.product_intelligence_reports (company_id, agent_id, analyzed_at DESC);

-- RLS
ALTER TABLE app.product_intelligence_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_intel_select" ON app.product_intelligence_reports;
CREATE POLICY "product_intel_select" ON app.product_intelligence_reports
    FOR SELECT USING (
        company_id IN (SELECT app.get_user_company_ids(auth.uid()))
    );

DROP POLICY IF EXISTS "product_intel_service_manage" ON app.product_intelligence_reports;
CREATE POLICY "product_intel_service_manage" ON app.product_intelligence_reports
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON app.product_intelligence_reports TO authenticated;
GRANT ALL ON app.product_intelligence_reports TO service_role;
