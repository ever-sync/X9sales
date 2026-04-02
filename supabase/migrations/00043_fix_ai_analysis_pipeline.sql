-- 00043_fix_ai_analysis_pipeline
-- Objetivo:
-- 1) Garantir colunas esperadas pelo scanner em app.ai_conversation_analysis
-- 2) Evitar que erro no trigger de coaching bloqueie o INSERT/UPSERT da analise
-- 3) Recriar funcao de coaching em versao resiliente

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Hardening de schema para app.ai_conversation_analysis
-- ---------------------------------------------------------------------------
ALTER TABLE app.ai_conversation_analysis
  ADD COLUMN IF NOT EXISTS predicted_csat smallint CHECK (predicted_csat BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_investigation smallint CHECK (score_investigation BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS score_commercial_steering smallint CHECK (score_commercial_steering BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS structured_analysis jsonb DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_ai_analysis_conversation'
      AND conrelid = 'app.ai_conversation_analysis'::regclass
  ) THEN
    ALTER TABLE app.ai_conversation_analysis
      ADD CONSTRAINT uq_ai_analysis_conversation UNIQUE (conversation_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Funcao de coaching simplificada e resiliente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.generate_coaching_action_for_analysis(p_analysis_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_analysis app.ai_conversation_analysis%ROWTYPE;
  v_existing_id uuid;
  v_action_id uuid;
  v_mode text;
  v_headline text;
  v_strengths jsonb;
  v_improvements jsonb;
  v_failure_tags jsonb;
BEGIN
  SELECT *
    INTO v_analysis
    FROM app.ai_conversation_analysis
   WHERE id = p_analysis_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT ca.id
    INTO v_existing_id
    FROM app.coaching_actions ca
   WHERE ca.company_id = v_analysis.company_id
     AND ca.conversation_id = v_analysis.conversation_id
     AND ca.action_type = 'auto_post_analysis'
     AND ca.meta ->> 'analysis_id' = p_analysis_id::text
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  v_mode := CASE
    WHEN COALESCE(v_analysis.needs_coaching, false) OR COALESCE(v_analysis.quality_score, 100) < 80
      THEN 'improvement'
    ELSE 'reinforcement'
  END;

  v_headline := COALESCE(
    v_analysis.coaching_tips[1],
    v_analysis.structured_analysis -> 'improvements' ->> 0,
    'Revisar pontos-chave da conversa para evoluir no proximo atendimento.'
  );

  v_strengths := COALESCE(v_analysis.structured_analysis -> 'strengths', '[]'::jsonb);
  v_improvements := COALESCE(v_analysis.structured_analysis -> 'improvements', '[]'::jsonb);
  v_failure_tags := COALESCE(v_analysis.structured_analysis -> 'failure_tags', '[]'::jsonb);

  INSERT INTO app.coaching_actions (
    company_id,
    conversation_id,
    agent_id,
    action_type,
    accepted,
    meta,
    created_at
  )
  VALUES (
    v_analysis.company_id,
    v_analysis.conversation_id,
    v_analysis.agent_id,
    'auto_post_analysis',
    false,
    jsonb_build_object(
      'analysis_id', v_analysis.id,
      'source', 'analysis-trigger',
      'mode', v_mode,
      'quality_score', v_analysis.quality_score,
      'needs_coaching', v_analysis.needs_coaching,
      'headline', v_headline,
      'training_tags', COALESCE(to_jsonb(v_analysis.training_tags), '[]'::jsonb),
      'strengths', v_strengths,
      'improvements', v_improvements,
      'failure_tags', v_failure_tags
    ),
    now()
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

-- Trigger wrapper que NAO bloqueia a analise em caso de erro.
CREATE OR REPLACE FUNCTION app.handle_ai_analysis_coaching_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  BEGIN
    PERFORM app.generate_coaching_action_for_analysis(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_ai_analysis_coaching_trigger falhou para analysis_id=%, erro=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_analysis_generate_coaching ON app.ai_conversation_analysis;

CREATE TRIGGER trg_ai_analysis_generate_coaching
AFTER INSERT ON app.ai_conversation_analysis
FOR EACH ROW
EXECUTE FUNCTION app.handle_ai_analysis_coaching_trigger();

REVOKE ALL ON FUNCTION app.generate_coaching_action_for_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.generate_coaching_action_for_analysis(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Higiene de jobs presos em "running" por muito tempo
-- ---------------------------------------------------------------------------
UPDATE app.ai_analysis_jobs
   SET status = 'failed',
       error_message = COALESCE(error_message, 'Job marcado como failed automaticamente por timeout de seguranca.'),
       finished_at = now(),
       updated_at = now()
 WHERE status = 'running'
   AND started_at IS NOT NULL
   AND started_at < now() - interval '45 minutes';

COMMIT;

