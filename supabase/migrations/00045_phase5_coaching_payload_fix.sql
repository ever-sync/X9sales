-- 00045_phase5_coaching_payload_fix
-- Objetivo:
-- 1) Restaurar payload rico do coaching automatico da fase 5
-- 2) Corrigir thresholds dos pilares para a escala real (0-10)
-- 3) Manter o trigger resiliente para nao bloquear a analise

BEGIN;

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
    v_primary_pillar_key text;
    v_primary_pillar_label text;
    v_playbook_label text;
    v_exercise text;
    v_quick_tip text;
    v_primary_score numeric;
    v_primary_tip text;
    v_strengths jsonb;
    v_improvements jsonb;
    v_failure_tags jsonb;
    v_example_conversation_id uuid;
    v_example_quality_score numeric;
    v_example_pillar_score numeric;
    v_example_customer_name text;
    v_example_agent_name text;
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

    SELECT
        pillar.key,
        pillar.label,
        pillar.playbook_label,
        pillar.exercise,
        pillar.quick_tip,
        pillar.score
      INTO
        v_primary_pillar_key,
        v_primary_pillar_label,
        v_playbook_label,
        v_exercise,
        v_quick_tip,
        v_primary_score
      FROM (
        VALUES
          (
            'score_investigation',
            'Investigacao',
            'Playbook de investigacao',
            'Antes de ofertar, valide dor, urgencia e criterio de decisao com 3 perguntas abertas.',
            'Use a sequencia: contexto, impacto e urgencia antes de apresentar proposta.',
            v_analysis.score_investigation::numeric
          ),
          (
            'score_commercial_steering',
            'Conducao comercial',
            'Playbook de conducao comercial',
            'Feche cada conversa com um proximo passo combinado e horario definido com o cliente.',
            'Troque mensagens abertas por convites concretos: call, proposta ou fechamento.',
            v_analysis.score_commercial_steering::numeric
          ),
          (
            'score_objection_handling',
            'Tratamento de objecoes',
            'Playbook de objecoes',
            'Responda a objecao em 3 etapas: reconheca, aprofunde e reposicione valor.',
            'Nao rebata preco de imediato. Descubra o que esta por tras da resistencia.',
            v_analysis.score_objection_handling::numeric
          ),
          (
            'score_empathy',
            'Empatia',
            'Playbook de empatia',
            'Espelhe o contexto do cliente antes de sugerir qualquer acao comercial.',
            'Mostre que entendeu a situacao com uma frase de validacao antes de conduzir.',
            v_analysis.score_empathy::numeric
          ),
          (
            'score_clarity',
            'Clareza',
            'Playbook de clareza',
            'Envie mensagens curtas com um unico objetivo e CTA explicito por vez.',
            'Troque blocos longos por passos simples e linguagem direta.',
            v_analysis.score_clarity::numeric
          )
      ) AS pillar(key, label, playbook_label, exercise, quick_tip, score)
     WHERE pillar.score IS NOT NULL
     ORDER BY pillar.score ASC, pillar.key ASC
     LIMIT 1;

    IF v_primary_pillar_key IS NULL THEN
        v_primary_pillar_key := 'quality_score';
        v_primary_pillar_label := 'Qualidade geral';
        v_playbook_label := 'Revisar conversa analisada';
        v_exercise := 'Revise os principais trechos da conversa e identifique um ponto concreto para repetir ou corrigir no proximo atendimento.';
        v_quick_tip := 'Transforme o feedback da IA em um ajuste pratico para a conversa seguinte.';
        v_primary_score := v_analysis.quality_score;
    END IF;

    v_primary_tip := COALESCE(
        v_analysis.coaching_tips[1],
        v_analysis.structured_analysis -> 'improvements' ->> 0,
        format('Seu foco agora esta em %s.', lower(v_primary_pillar_label))
    );

    v_strengths := COALESCE(v_analysis.structured_analysis -> 'strengths', '[]'::jsonb);
    v_improvements := COALESCE(v_analysis.structured_analysis -> 'improvements', '[]'::jsonb);
    v_failure_tags := COALESCE(v_analysis.structured_analysis -> 'failure_tags', '[]'::jsonb);

    SELECT
        aia.conversation_id,
        aia.quality_score::numeric,
        CASE
            WHEN v_primary_pillar_key = 'score_investigation' THEN aia.score_investigation::numeric
            WHEN v_primary_pillar_key = 'score_commercial_steering' THEN aia.score_commercial_steering::numeric
            WHEN v_primary_pillar_key = 'score_objection_handling' THEN aia.score_objection_handling::numeric
            WHEN v_primary_pillar_key = 'score_empathy' THEN aia.score_empathy::numeric
            WHEN v_primary_pillar_key = 'score_clarity' THEN aia.score_clarity::numeric
            ELSE aia.quality_score::numeric
        END AS pillar_score,
        COALESCE(cu.name, 'Cliente') AS customer_name,
        COALESCE(ag.name, 'Time') AS agent_name
      INTO
        v_example_conversation_id,
        v_example_quality_score,
        v_example_pillar_score,
        v_example_customer_name,
        v_example_agent_name
      FROM app.ai_conversation_analysis aia
      LEFT JOIN app.conversations c ON c.id = aia.conversation_id
      LEFT JOIN app.customers cu ON cu.id = c.customer_id
      LEFT JOIN app.agents ag ON ag.id = aia.agent_id
     WHERE aia.company_id = v_analysis.company_id
       AND aia.id <> v_analysis.id
       AND (
            (v_primary_pillar_key = 'score_investigation' AND aia.score_investigation >= 9) OR
            (v_primary_pillar_key = 'score_commercial_steering' AND aia.score_commercial_steering >= 9) OR
            (v_primary_pillar_key = 'score_objection_handling' AND aia.score_objection_handling >= 9) OR
            (v_primary_pillar_key = 'score_empathy' AND aia.score_empathy >= 9) OR
            (v_primary_pillar_key = 'score_clarity' AND aia.score_clarity >= 9) OR
            (v_primary_pillar_key = 'quality_score' AND aia.quality_score >= 90)
       )
     ORDER BY
        CASE
            WHEN v_primary_pillar_key = 'score_investigation' THEN aia.score_investigation
            WHEN v_primary_pillar_key = 'score_commercial_steering' THEN aia.score_commercial_steering
            WHEN v_primary_pillar_key = 'score_objection_handling' THEN aia.score_objection_handling
            WHEN v_primary_pillar_key = 'score_empathy' THEN aia.score_empathy
            WHEN v_primary_pillar_key = 'score_clarity' THEN aia.score_clarity
            ELSE aia.quality_score
        END DESC NULLS LAST,
        aia.quality_score DESC NULLS LAST,
        aia.analyzed_at DESC
     LIMIT 1;

    v_mode := CASE
        WHEN COALESCE(v_analysis.needs_coaching, false) OR COALESCE(v_analysis.quality_score, 100) < 80 THEN 'improvement'
        ELSE 'reinforcement'
    END;

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
            'primary_pillar', v_primary_pillar_key,
            'primary_pillar_label', v_primary_pillar_label,
            'primary_score', v_primary_score,
            'headline', v_primary_tip,
            'playbook_label', v_playbook_label,
            'exercise', v_exercise,
            'quick_tip', v_quick_tip,
            'quality_score', v_analysis.quality_score,
            'needs_coaching', v_analysis.needs_coaching,
            'training_tags', COALESCE(to_jsonb(v_analysis.training_tags), '[]'::jsonb),
            'strengths', v_strengths,
            'improvements', v_improvements,
            'failure_tags', v_failure_tags,
            'example', CASE
                WHEN v_example_conversation_id IS NULL THEN NULL
                ELSE jsonb_build_object(
                    'conversation_id', v_example_conversation_id,
                    'quality_score', v_example_quality_score,
                    'pillar_score', v_example_pillar_score,
                    'customer_name', v_example_customer_name,
                    'agent_name', v_example_agent_name
                )
            END
        ),
        now()
    )
    RETURNING id INTO v_action_id;

    RETURN v_action_id;
END;
$$;

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

COMMIT;
