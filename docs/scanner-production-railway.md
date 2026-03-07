# Scanner em Producao (Vercel + Supabase + Railway)

## Objetivo
Deixar o `scanner` rodando 24/7 sem operacao manual, com deploy continuo e rotina de monitoramento.

## Arquitetura
1. `Vercel`: frontend React.
2. `Supabase`: webhooks e Edge Functions, persistencia em `raw.messages`.
3. `Railway Worker`: processo continuo `node dist/index.js` para transformar `raw.messages` em `app.conversations` e `app.messages`.

## Deploy no Railway
1. Criar projeto em `Railway` e conectar ao repositorio.
2. No servico do scanner, definir `Root Directory = scanner`.
3. Build command: `npm ci && npm run build`.
4. Start command: `npm run start`.
5. Habilitar auto-deploy na branch principal.

O arquivo [`scanner/railway.toml`](../../scanner/railway.toml) ja define build/start/restart policy.

## Variaveis obrigatorias
1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `ANTHROPIC_API_KEY` (quando analise IA estiver habilitada)
4. `OPENAI_API_KEY` (quando embeddings/fluxos OpenAI estiverem habilitados)

## Defaults recomendados
1. `SCANNER_CRON=*/1 * * * *`
2. `SCANNER_AGGREGATOR_CRON=*/10 * * * *`
3. `SCANNER_SPAM_CRON=*/15 * * * *`
4. `SCANNER_AI_JOBS_CRON=*/1 * * * *`
5. `SCANNER_REVENUE_COPILOT_CRON=*/1 * * * *`
6. `SCANNER_MANAGER_COPILOT_CRON=*/1 * * * *`
7. `SCANNER_BATCH_SIZE=1000`
8. `SCANNER_MAX_RETRIES=3`

## Observabilidade minima
Criar alertas no Railway para restart/crash e acompanhar logs com:
1. `[MessageProcessor] ... messages to process`
2. `[MessageProcessor] Cycle complete.`
3. `Failed to ...`

## Checklist diario (SQL)
Use o SQL Editor do Supabase.

```sql
-- 1) Backlog nao processado
select company_id, count(*) as pending
from raw.messages
where processed = false
group by company_id
order by pending desc;
```

```sql
-- 2) Conversas recentes por empresa (ultimas 24h)
select company_id, count(*) as conversations_24h
from app.conversations
where started_at >= now() - interval '24 hours'
group by company_id
order by conversations_24h desc;
```

```sql
-- 3) Mensagens recentes por empresa (ultimas 24h)
select company_id, count(*) as messages_24h
from app.messages
where created_at >= now() - interval '24 hours'
group by company_id
order by messages_24h desc;
```

## Aceite operacional
1. Nova mensagem da UazAPI entra em `raw.messages` imediatamente.
2. Em ate 1-2 minutos, aparece em `app.messages` e `app.conversations`.
3. Reinicio manual do worker nao gera perda de processamento.

## Escalabilidade
1. Comecar com 1 instancia.
2. Escalar primeiro por `SCANNER_BATCH_SIZE` e recursos de maquina.
3. Antes de mais de 1 replica, implementar lock/claiming distribuido para evitar corrida.
