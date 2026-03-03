-- ============================================================
-- cleanup_mock_data.sql - Limpar todos os dados operacionais
-- Execute no Supabase SQL Editor (cole o script inteiro)
-- ATENCAO: Isto apaga TODOS os dados de app/raw.
-- auth.users nao e afetado.
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  -- Desabilita triggers de auditoria do schema app para evitar erro de FK.
  FOR r IN
    SELECT
      quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS fq_table,
      quote_ident(t.tgname) AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND t.tgisinternal = false
      AND t.tgname LIKE 'audit_%'
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %s', r.fq_table, r.trigger_name);
  END LOOP;

  -- Limpa RAW.
  TRUNCATE TABLE
    raw.messages,
    raw.conversations,
    raw.calls,
    raw.deals,
    raw.processing_errors
  RESTART IDENTITY CASCADE;

  -- Limpa APP.
  TRUNCATE TABLE
    app.ai_conversation_analysis,
    app.spam_risk_events,
    app.messages,
    app.events,
    app.metrics_conversation,
    app.metrics_agent_daily,
    app.alerts,
    app.qa_reviews,
    app.conversations,
    app.customers,
    app.team_members,
    app.teams,
    app.agents,
    app.company_members,
    app.knowledge_base,
    app.audit_logs,
    app.processing_watermarks,
    app.companies
  RESTART IDENTITY CASCADE;

  -- Reabilita triggers de auditoria.
  FOR r IN
    SELECT
      quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS fq_table,
      quote_ident(t.tgname) AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND t.tgisinternal = false
      AND t.tgname LIKE 'audit_%'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %s', r.fq_table, r.trigger_name);
  END LOOP;

  RAISE NOTICE 'Banco limpo com sucesso. Dados operacionais zerados.';
END;
$$;

-- Atualiza materialized views para refletir banco vazio.
SELECT app.refresh_dashboard_views();
