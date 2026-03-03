-- =============================================================
-- Seed: dados de teste para validar o fluxo de mensagens
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================

-- 1. Criar empresa de teste
INSERT INTO app.companies (id, name, slug, settings)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Empresa Teste',
    'empresa-teste',
    '{
        "sla_first_response_sec": 300,
        "sla_resolution_sec": 86400,
        "timezone": "America/Sao_Paulo",
        "working_hours_start": "08:00",
        "working_hours_end": "18:00",
        "working_days": [1,2,3,4,5]
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 2. Criar agente de teste
INSERT INTO app.agents (id, company_id, external_id, name, email, is_active)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'agent-joao',
    'João Atendente',
    'joao@empresa.com',
    true
)
ON CONFLICT (company_id, external_id) DO NOTHING;

-- 3. Criar cliente de teste
INSERT INTO app.customers (id, company_id, external_id, name, phone)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'cust-maria',
    'Maria Silva',
    '5511999990001'
)
ON CONFLICT (company_id, external_id) DO NOTHING;

INSERT INTO app.customers (id, company_id, external_id, name, phone)
VALUES (
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'cust-pedro',
    'Pedro Santos',
    '5511999990002'
)
ON CONFLICT (company_id, external_id) DO NOTHING;

-- 4. Criar conversas de teste
INSERT INTO app.conversations (id, company_id, agent_id, customer_id, channel, status, started_at, message_count_in, message_count_out)
VALUES
    (
        'd0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001',
        'whatsapp',
        'closed',
        now() - interval '2 hours',
        4, 3
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000002',
        'whatsapp',
        'active',
        now() - interval '30 minutes',
        2, 1
    )
ON CONFLICT (id) DO NOTHING;

-- 5. Inserir mensagens na conversa 1 (Maria - completa)
INSERT INTO app.messages (company_id, conversation_id, sender_type, sender_id, content, content_type, external_message_id, created_at)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'customer', 'c0000000-0000-0000-0000-000000000001',
        'Olá, preciso de ajuda com meu pedido #12345',
        'text', 'seed-msg-001',
        now() - interval '2 hours'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'agent', 'b0000000-0000-0000-0000-000000000001',
        'Olá Maria! Vou verificar seu pedido agora mesmo. Um momento por favor.',
        'text', 'seed-msg-002',
        now() - interval '1 hour 55 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'customer', 'c0000000-0000-0000-0000-000000000001',
        'Ok, obrigada!',
        'text', 'seed-msg-003',
        now() - interval '1 hour 54 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'agent', 'b0000000-0000-0000-0000-000000000001',
        'Maria, encontrei seu pedido. Ele está em transporte e deve chegar amanhã. Posso ajudar com mais alguma coisa?',
        'text', 'seed-msg-004',
        now() - interval '1 hour 50 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'customer', 'c0000000-0000-0000-0000-000000000001',
        'Não, era só isso. Muito obrigada pela ajuda!',
        'text', 'seed-msg-005',
        now() - interval '1 hour 49 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'agent', 'b0000000-0000-0000-0000-000000000001',
        'Por nada! Qualquer dúvida estamos à disposição. Tenha um ótimo dia! 😊',
        'text', 'seed-msg-006',
        now() - interval '1 hour 48 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'customer', 'c0000000-0000-0000-0000-000000000001',
        'Obrigada, bom dia!',
        'text', 'seed-msg-007',
        now() - interval '1 hour 47 minutes'
    );

-- 6. Inserir mensagens na conversa 2 (Pedro - em andamento)
INSERT INTO app.messages (company_id, conversation_id, sender_type, sender_id, content, content_type, external_message_id, created_at)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'customer', 'c0000000-0000-0000-0000-000000000002',
        'Boa tarde, quero cancelar minha assinatura',
        'text', 'seed-msg-008',
        now() - interval '30 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'agent', 'b0000000-0000-0000-0000-000000000001',
        'Boa tarde Pedro! Lamento saber disso. Posso perguntar o motivo do cancelamento? Talvez possamos encontrar uma solução.',
        'text', 'seed-msg-009',
        now() - interval '25 minutes'
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'customer', 'c0000000-0000-0000-0000-000000000002',
        'Estou achando caro, o concorrente tem preço menor',
        'text', 'seed-msg-010',
        now() - interval '20 minutes'
    );

-- 7. Inserir métricas de conversa
INSERT INTO app.metrics_conversation (company_id, conversation_id, agent_id, first_response_time_sec, message_count_in, message_count_out, avg_response_gap_sec, sla_first_response_met, channel, conversation_date)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        300, 4, 3, 180, true, 'whatsapp', CURRENT_DATE
    ),
    (
        'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000001',
        300, 2, 1, 300, true, 'whatsapp', CURRENT_DATE
    )
ON CONFLICT (conversation_id) DO NOTHING;

-- 8. Inserir eventos
INSERT INTO app.events (company_id, event_type, conversation_id, agent_id, event_timestamp, meta, source_raw_id)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        'FIRST_RESPONSE',
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        now() - interval '1 hour 55 minutes',
        '{"first_response_time_sec": 300}'::jsonb,
        'd0000000-0000-0000-0000-000000000001'
    )
ON CONFLICT (company_id, event_type, source_raw_id) DO NOTHING;

-- 9. Refresh materialized views para o dashboard
REFRESH MATERIALIZED VIEW IF EXISTS app.mv_dashboard_overview;
REFRESH MATERIALIZED VIEW IF EXISTS app.mv_agent_ranking;
REFRESH MATERIALIZED VIEW IF EXISTS app.mv_daily_trend;

-- Verificação final
SELECT 'companies' AS tabela, count(*) FROM app.companies
UNION ALL
SELECT 'agents', count(*) FROM app.agents
UNION ALL
SELECT 'customers', count(*) FROM app.customers
UNION ALL
SELECT 'conversations', count(*) FROM app.conversations
UNION ALL
SELECT 'messages', count(*) FROM app.messages
UNION ALL
SELECT 'metrics', count(*) FROM app.metrics_conversation
UNION ALL
SELECT 'events', count(*) FROM app.events;
