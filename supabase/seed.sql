-- ============================================================
-- seed.sql — Dados de teste para MonitoraIA
-- Execute no Supabase SQL Editor (cole o script inteiro)
-- Login de teste: admin@monitora.dev / Admin@1234
-- ============================================================

DO $$
DECLARE
    v_user_id       uuid;
    v_company_id    uuid;
    v_agent1_id     uuid;
    v_agent2_id     uuid;
    v_agent3_id     uuid;
    v_agent4_id     uuid;
    v_agent_ids     uuid[];
    v_cust_ids      uuid[] := '{}';
    v_cust_id       uuid;
    v_conv_id       uuid;
    i               integer;
    j               integer;
    d               date;
    v_channel       text;
    v_status        text;
    v_agent_id      uuid;
    v_cust_idx      integer;
    v_started_at    timestamptz;
    v_closed_at     timestamptz;
    v_frt_sec       integer;
    v_res_sec       integer;
    v_msg_in        integer;
    v_msg_out       integer;
    v_sla_frt       boolean;
    v_sla_res       boolean;
BEGIN
    -- ----------------------------------------------------------------
    -- 0. Limpar dados anteriores (desabilita audit triggers para evitar
    --    FK violation durante o cascade delete)
    -- ----------------------------------------------------------------
    EXECUTE 'ALTER TABLE app.company_members DISABLE TRIGGER audit_company_members';
    EXECUTE 'ALTER TABLE app.qa_reviews      DISABLE TRIGGER audit_qa_reviews';
    EXECUTE 'ALTER TABLE app.alerts          DISABLE TRIGGER audit_alerts';

    -- Limpa spam_risk_events antes dos alerts para evitar FK violation
    DELETE FROM app.spam_risk_events
    WHERE company_id IN (SELECT id FROM app.companies WHERE slug = 'acme');

    DELETE FROM app.companies WHERE slug = 'acme';

    EXECUTE 'ALTER TABLE app.company_members ENABLE TRIGGER audit_company_members';
    EXECUTE 'ALTER TABLE app.qa_reviews      ENABLE TRIGGER audit_qa_reviews';
    EXECUTE 'ALTER TABLE app.alerts          ENABLE TRIGGER audit_alerts';

    -- ----------------------------------------------------------------
    -- 1. Buscar usuário admin
    -- ----------------------------------------------------------------
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@monitora.dev';
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário admin@monitora.dev não encontrado. Crie primeiro em Authentication > Users.';
    END IF;

    -- ----------------------------------------------------------------
    -- 2. Empresa
    -- ----------------------------------------------------------------
    INSERT INTO app.companies (name, slug)
    VALUES ('Acme Atendimento', 'acme')
    RETURNING id INTO v_company_id;

    -- ----------------------------------------------------------------
    -- 3. Admin como owner_admin
    -- ----------------------------------------------------------------
    INSERT INTO app.company_members (company_id, user_id, role)
    VALUES (v_company_id, v_user_id, 'owner_admin');

    -- ----------------------------------------------------------------
    -- 4. Agentes (4 ativos + 1 inativo)
    -- ----------------------------------------------------------------
    INSERT INTO app.agents (company_id, external_id, name, email)
    VALUES (v_company_id, 'ag01', 'Ana Lima', 'ana@acme.com')
    RETURNING id INTO v_agent1_id;

    INSERT INTO app.agents (company_id, external_id, name, email)
    VALUES (v_company_id, 'ag02', 'Bruno Silva', 'bruno@acme.com')
    RETURNING id INTO v_agent2_id;

    INSERT INTO app.agents (company_id, external_id, name, email)
    VALUES (v_company_id, 'ag03', 'Carla Souza', 'carla@acme.com')
    RETURNING id INTO v_agent3_id;

    INSERT INTO app.agents (company_id, external_id, name, email)
    VALUES (v_company_id, 'ag04', 'Diego Martins', 'diego@acme.com')
    RETURNING id INTO v_agent4_id;

    -- Agente inativo (para testar filtro)
    INSERT INTO app.agents (company_id, external_id, name, email, is_active)
    VALUES (v_company_id, 'ag05', 'Elisa Ramos', 'elisa@acme.com', false);

    v_agent_ids := ARRAY[v_agent1_id, v_agent2_id, v_agent3_id, v_agent4_id];

    -- ----------------------------------------------------------------
    -- 5. Clientes (15)
    -- ----------------------------------------------------------------
    FOR i IN 1..15 LOOP
        INSERT INTO app.customers (company_id, external_id, name, phone)
        VALUES (
            v_company_id,
            'cust_' || i,
            (ARRAY[
                'João Santos','Maria Oliveira','Pedro Costa','Fernanda Alves',
                'Ricardo Pereira','Juliana Ferreira','Marcos Lima','Amanda Rodrigues',
                'Lucas Nascimento','Patrícia Gomes','Thiago Mendes','Camila Barbosa',
                'Rafael Carvalho','Beatriz Dias','Felipe Moreira'
            ])[i],
            '+5511' || lpad((900000000 + i * 1111)::text, 9, '0')
        )
        RETURNING id INTO v_cust_id;
        v_cust_ids := array_append(v_cust_ids, v_cust_id);
    END LOOP;

    -- ----------------------------------------------------------------
    -- 6. Conversas (60, distribuídas nos últimos 30 dias)
    -- ----------------------------------------------------------------
    FOR i IN 1..60 LOOP
        -- Canais: 50% whatsapp, 25% email, 25% chat
        v_channel := CASE (i % 4)
            WHEN 0 THEN 'whatsapp'
            WHEN 1 THEN 'whatsapp'
            WHEN 2 THEN 'email'
            ELSE         'chat'
        END;

        -- Status: ~60% closed, 30% active, 10% waiting
        v_status := CASE
            WHEN (i % 10) < 6 THEN 'closed'
            WHEN (i % 10) < 9 THEN 'active'
            ELSE                    'waiting'
        END;

        v_agent_id   := v_agent_ids[1 + (i % 4)];
        v_cust_idx   := 1 + (i % 15);
        v_started_at := now()
                      - ((30 - (i % 30)) || ' days')::interval
                      - ((i % 10)        || ' hours')::interval;

        IF v_status = 'closed' THEN
            v_frt_sec   := 60  + (i * 37  % 540);   -- 1 a 10 min
            v_res_sec   := 600 + (i * 113 % 82200);  -- 10 min a ~23h
            v_closed_at := v_started_at + (v_res_sec || ' seconds')::interval;
            v_msg_in    := 2 + (i % 8);
            v_msg_out   := 2 + (i % 6);
            v_sla_frt   := v_frt_sec <= 300;
            v_sla_res   := v_res_sec <= 86400;
        ELSE
            v_frt_sec   := NULL;
            v_res_sec   := NULL;
            v_closed_at := NULL;
            v_msg_in    := 1 + (i % 4);
            v_msg_out   := 0 + (i % 3);
            v_sla_frt   := NULL;
            v_sla_res   := NULL;
        END IF;

        INSERT INTO app.conversations (
            company_id, agent_id, customer_id, channel, status,
            started_at, closed_at, message_count_in, message_count_out
        )
        VALUES (
            v_company_id, v_agent_id, v_cust_ids[v_cust_idx],
            v_channel, v_status,
            v_started_at, v_closed_at,
            v_msg_in, v_msg_out
        )
        RETURNING id INTO v_conv_id;

        -- Métricas por conversa (apenas fechadas)
        IF v_status = 'closed' THEN
            INSERT INTO app.metrics_conversation (
                company_id, conversation_id, agent_id,
                first_response_time_sec, resolution_time_sec,
                message_count_in, message_count_out,
                avg_response_gap_sec,
                sla_first_response_met, sla_resolution_met,
                channel, conversation_date
            )
            VALUES (
                v_company_id, v_conv_id, v_agent_id,
                v_frt_sec, v_res_sec,
                v_msg_in, v_msg_out,
                v_frt_sec / GREATEST(v_msg_out, 1),
                v_sla_frt, v_sla_res,
                v_channel, v_started_at::date
            );
        END IF;
    END LOOP;

    -- ----------------------------------------------------------------
    -- 7. Métricas diárias por agente (últimos 30 dias)
    -- ----------------------------------------------------------------
    FOR j IN 0..29 LOOP
        d := current_date - j;
        FOR i IN 1..4 LOOP
            v_agent_id := v_agent_ids[i];
            INSERT INTO app.metrics_agent_daily (
                company_id, agent_id, metric_date,
                conversations_total, conversations_closed,
                avg_first_response_sec, avg_resolution_sec,
                sla_first_response_pct, sla_resolution_pct,
                messages_sent, messages_received,
                deals_won, deals_lost
            )
            VALUES (
                v_company_id,
                v_agent_id,
                d,
                4 + (i + j) % 6,
                2 + (i + j) % 4,
                90   + (i * 47  + j) % 300,
                1800 + (i * 313 + j) % 7200,
                round(cast(70 + (i * 7 + j) % 28 as numeric), 2),
                round(cast(75 + (i * 5 + j) % 22 as numeric), 2),
                6 + (i + j) % 10,
                8 + (i + j) % 12,
                (i + j) % 3,
                (i + j) % 2
            );
        END LOOP;
    END LOOP;

    -- ----------------------------------------------------------------
    -- 8. Alertas abertos (para testar a página Alerts)
    -- ----------------------------------------------------------------
    INSERT INTO app.alerts (company_id, alert_type, severity, status, title, description, agent_id)
    VALUES
        (v_company_id, 'sla_breach',   'critical', 'open',
         'SLA crítico — conversa há +23h sem resolução',
         'Uma conversa está aberta há mais de 23 horas sem resolução.',
         v_agent2_id),
        (v_company_id, 'sla_breach',   'high',     'open',
         'SLA violado — Diego Martins',
         '3 conversas abertas há mais de 4 horas sem resposta do agente.',
         v_agent4_id),
        (v_company_id, 'volume_spike', 'medium',   'open',
         'Pico de volume no WhatsApp',
         'Volume 40% acima da média das últimas 4 horas.',
         NULL);

    -- ----------------------------------------------------------------
    -- 9. Watermarks do scanner (para não reprocessar tudo no 1º run)
    -- ----------------------------------------------------------------
    INSERT INTO app.processing_watermarks (company_id, source_table, last_processed_at)
    VALUES
        (v_company_id, 'raw.messages', now() - interval '2 minutes'),
        (v_company_id, 'raw.calls',    now() - interval '2 minutes'),
        (v_company_id, 'raw.deals',    now() - interval '2 minutes');

    RAISE NOTICE 'Seed concluído! company_id = %', v_company_id;
END;
$$;

-- ----------------------------------------------------------------
-- Dados de teste: spam_risk_events (Riscos de Banimento Meta)
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_company_id    uuid;
    v_agent2_id     uuid;
    v_agent4_id     uuid;
    v_alert1_id     uuid;
    v_alert2_id     uuid;
BEGIN
    SELECT id INTO v_company_id FROM app.companies WHERE slug = 'acme';
    SELECT id INTO v_agent2_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag02';
    SELECT id INTO v_agent4_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag04';

    -- Alerta 1: Bruno Silva — mensagem idêntica para 12 clientes
    INSERT INTO app.alerts (company_id, alert_type, severity, status, title, description, agent_id, meta)
    VALUES (
        v_company_id, 'META_BAN_RISK', 'high', 'open',
        'Risco de banimento Meta: 12 clientes receberam mensagem idêntica',
        'Atendente Bruno Silva enviou "Boa tarde! Temos uma promoção imperdível..." para 12 clientes diferentes em 48 minutos.',
        v_agent2_id,
        '{"pattern_type":"identical_message","recipient_count":12,"occurrence_count":12,"message_sample":"Boa tarde! Temos uma promoção imperdível nesta semana, condições especiais para você."}'
    ) RETURNING id INTO v_alert1_id;

    INSERT INTO app.spam_risk_events (
        company_id, agent_id, detected_at, window_start, window_end,
        pattern_type, identical_message_hash, message_sample,
        recipient_count, occurrence_count, risk_level, alert_id
    ) VALUES (
        v_company_id, v_agent2_id,
        now() - interval '3 hours',
        now() - interval '4 hours',
        now() - interval '3 hours 12 minutes',
        'identical_message',
        'a3f1c9b2d4e5f678',
        'Boa tarde! Temos uma promoção imperdível nesta semana, condições especiais para você.',
        12, 12, 'high', v_alert1_id
    );

    -- Alerta 2: Diego Martins — burst volume (crítico)
    INSERT INTO app.alerts (company_id, alert_type, severity, status, title, description, agent_id, meta)
    VALUES (
        v_company_id, 'META_BAN_RISK', 'critical', 'open',
        'Risco de banimento Meta: 23 clientes receberam mensagem idêntica',
        'Atendente Diego Martins enviou mensagem idêntica para 23 clientes diferentes em 38 minutos.',
        v_agent4_id,
        '{"pattern_type":"identical_message","recipient_count":23,"occurrence_count":23,"message_sample":"Olá! Última chance de garantir nosso plano com 30% de desconto. Responda AGORA!"}'
    ) RETURNING id INTO v_alert2_id;

    INSERT INTO app.spam_risk_events (
        company_id, agent_id, detected_at, window_start, window_end,
        pattern_type, identical_message_hash, message_sample,
        recipient_count, occurrence_count, risk_level, alert_id
    ) VALUES (
        v_company_id, v_agent4_id,
        now() - interval '1 hour',
        now() - interval '2 hours',
        now() - interval '1 hour 22 minutes',
        'identical_message',
        'b7e2d4c1a9f83012',
        'Olá! Última chance de garantir nosso plano com 30% de desconto. Responda AGORA!',
        23, 23, 'critical', v_alert2_id
    );

    RAISE NOTICE 'Dados de spam_risk_events inseridos com sucesso.';
END;
$$;

-- ----------------------------------------------------------------
-- Dados de teste: ai_conversation_analysis
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_company_id    uuid;
    v_agent1_id     uuid;
    v_agent2_id     uuid;
    v_agent3_id     uuid;
    v_agent4_id     uuid;
    v_conv_ids      uuid[];
    v_conv_id       uuid;
BEGIN
    SELECT id INTO v_company_id FROM app.companies WHERE slug = 'acme';
    SELECT id INTO v_agent1_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag01';
    SELECT id INTO v_agent2_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag02';
    SELECT id INTO v_agent3_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag03';
    SELECT id INTO v_agent4_id  FROM app.agents WHERE company_id = v_company_id AND external_id = 'ag04';

    -- Limpar análises anteriores
    DELETE FROM app.ai_conversation_analysis WHERE company_id = v_company_id;

    -- Pegar IDs de conversas fechadas
    SELECT ARRAY(
        SELECT id FROM app.conversations
        WHERE company_id = v_company_id AND status = 'closed'
        ORDER BY started_at DESC LIMIT 6
    ) INTO v_conv_ids;

    -- Só inserir se houver conversas
    IF array_length(v_conv_ids, 1) IS NULL OR array_length(v_conv_ids, 1) = 0 THEN
        RAISE NOTICE 'Nenhuma conversa fechada encontrada — pulando ai_conversation_analysis.';
        RETURN;
    END IF;

    -- Análise 1 — Ana Lima (alta qualidade)
    IF array_length(v_conv_ids, 1) >= 1 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[1], v_agent1_id,
            92, true,
            9, 9, 9, null,
            8, 7, 9, 8,
            true, true, true, true,
            false, '{}', '{}',
            'claude-haiku-4-5-20251001', 'v1', now() - interval '2 hours'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    -- Análise 2 — Bruno Silva (qualidade média, precisa coaching)
    IF array_length(v_conv_ids, 1) >= 2 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[2], v_agent2_id,
            58, true,
            5, 7, 6, 4,
            5, 8, 4, 3,
            false, true, false, false,
            true,
            ARRAY[
                'Demonstrar mais empatia ao escutar as preocupações do cliente antes de apresentar soluções',
                'Evitar urgência artificial — o cliente percebeu e ficou na defensiva',
                'Aprofundar a proposta de valor antes de avançar para o fechamento'
            ],
            ARRAY['empatia', 'argumentacao_vendas', 'escuta_ativa'],
            'claude-haiku-4-5-20251001', 'v1', now() - interval '90 minutes'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    -- Análise 3 — Carla Souza (boa qualidade)
    IF array_length(v_conv_ids, 1) >= 3 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[3], v_agent3_id,
            81, false,
            8, 9, 8, 9,
            null, null, null, null,
            false, false, false, false,
            false, '{}', '{}',
            'claude-haiku-4-5-20251001', 'v1', now() - interval '3 hours'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    -- Análise 4 — Diego Martins (baixa qualidade, precisa coaching urgente)
    IF array_length(v_conv_ids, 1) >= 4 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[4], v_agent4_id,
            41, true,
            3, 5, 4, 2,
            3, 9, 2, 1,
            false, true, false, false,
            true,
            ARRAY[
                'Trabalhar na escuta ativa — interrompeu o cliente múltiplas vezes',
                'Reduzir o tom de pressão — o cliente se sentiu desconfortável com a urgência excessiva',
                'Estudar técnicas de resolução de conflitos para situações onde o cliente demonstra insatisfação'
            ],
            ARRAY['empatia', 'resolucao_conflitos', 'escuta_ativa', 'profissionalismo'],
            'claude-haiku-4-5-20251001', 'v1', now() - interval '45 minutes'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    -- Análise 5 — Ana Lima (segunda análise, qualidade alta)
    IF array_length(v_conv_ids, 1) >= 5 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[5], v_agent1_id,
            88, false,
            9, 9, 8, 7,
            null, null, null, null,
            false, false, false, false,
            false, '{}', '{}',
            'claude-haiku-4-5-20251001', 'v1', now() - interval '5 hours'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    -- Análise 6 — Bruno Silva (segunda análise, ligeira melhora)
    IF array_length(v_conv_ids, 1) >= 6 THEN
        INSERT INTO app.ai_conversation_analysis (
            company_id, conversation_id, agent_id,
            quality_score, is_sales_conversation,
            score_empathy, score_professionalism, score_clarity, score_conflict_resolution,
            score_rapport, score_urgency, score_value_proposition, score_objection_handling,
            used_rapport, used_urgency, used_value_proposition, used_objection_handling,
            needs_coaching, coaching_tips, training_tags,
            model_used, prompt_version, analyzed_at
        ) VALUES (
            v_company_id, v_conv_ids[6], v_agent2_id,
            65, true,
            6, 7, 7, null,
            6, 7, 5, 5,
            true, true, true, false,
            false, '{}', ARRAY['follow_up'],
            'claude-haiku-4-5-20251001', 'v1', now() - interval '1 hour'
        ) ON CONFLICT (conversation_id) DO NOTHING;
    END IF;

    RAISE NOTICE 'Dados de ai_conversation_analysis inseridos com sucesso.';
END;
$$;

-- Popula as materialized views (precisa rodar DEPOIS do DO block)
SELECT app.refresh_dashboard_views();
