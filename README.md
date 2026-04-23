# X9Sales

Plataforma de operacao comercial com foco em monitoramento de conversas, inteligencia de atendimento e automacoes apoiadas por IA.

O repositorio concentra:

- frontend React + Vite para operacao, auditoria e configuracoes;
- `scanner/`, um worker Node.js responsavel por processar eventos, agregacoes e jobs recorrentes;
- `supabase/` com migrations, seeds e Edge Functions;
- `docs/` com backlog, plano tatico e referencias arquiteturais.

## Arquitetura rapida

### Frontend

- stack: React 19, TypeScript, Vite, TanStack Query, Supabase JS;
- pasta principal: `src/`;
- rotas: [src/App.tsx](/Users/rapha/Desenvolvimento/X9sales/src/App.tsx);
- paginas mais pesadas agora usam lazy loading por rota.

### Scanner

- stack: Node.js + TypeScript;
- pasta principal: `scanner/src/`;
- entrada: [scanner/src/index.ts](/Users/rapha/Desenvolvimento/X9sales/scanner/src/index.ts);
- executa cron jobs de ingestao, analise IA, coaching, digest e agregacoes.

### Backend Supabase

- migrations: `supabase/migrations/`;
- functions: `supabase/functions/`;
- seeds: `supabase/seed.sql` e `supabase/seed_test_messages.sql`.

## Estrutura do repositorio

```text
.
├── src/                  # app web
├── scanner/              # worker/cron processor
├── supabase/             # migrations, functions e seeds
├── docs/                 # backlog, plano de execucao e analises
├── public/               # assets estaticos
└── n8n/                  # workflow auxiliar de ingestao
```

## Requisitos

- Node.js 22+
- npm 10+
- projeto Supabase configurado

Opcional para ambiente local mais completo:

- Supabase CLI
- Docker Desktop

## Variaveis de ambiente

Use [`.env.example`](/Users/rapha/Desenvolvimento/X9sales/.env.example) como base.

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Scanner

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `SCANNER_CRON`
- `SCANNER_AGGREGATOR_CRON`
- `SCANNER_SPAM_CRON`
- `SCANNER_AI_JOBS_CRON`
- `SCANNER_REVENUE_COPILOT_CRON`
- `SCANNER_MANAGER_COPILOT_CRON`
- `SCANNER_DAILY_AI_FULL_SCAN_CRON`
- `SCANNER_BATCH_SIZE`
- `SCANNER_MAX_RETRIES`

### Integracoes e notificacoes

- `APP_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `RESEND_API_KEY`
- `UAZAPI_BASE_URL`
- `UAZAPI_INSTANCE`
- `UAZAPI_TOKEN`
- `WHATSAPP_NOTIFY_PHONE`
- `WEBHOOK_SECRET`

## Setup local

### 1. Instalar dependencias

```bash
npm install
npm --prefix scanner install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
```

Preencha pelo menos:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Subir o frontend

```bash
npm run dev
```

Aplicacao web padrao: [http://localhost:5173](http://localhost:5173)

### 4. Subir o scanner

Em outro terminal:

```bash
npm --prefix scanner run dev
```

### 5. Aplicar banco e seeds

Se estiver usando Supabase local:

```bash
supabase start
supabase db reset
```

Se estiver apontando para um projeto remoto, aplique as migrations e seeds com o fluxo que sua equipe usa hoje antes de testar rotas dependentes de dados.

## Scripts principais

### Frontend

```bash
npm run dev
npm run lint
npm run test:run
npm run build
npm run build:scanner
npm run ci
```

### Scanner

```bash
npm --prefix scanner run dev
npm --prefix scanner run build
npm --prefix scanner run start
```

## Testes e qualidade

- testes: Vitest com foco inicial em funcoes puras criticas;
- lint: ESLint;
- CI: GitHub Actions em [`.github/workflows/ci.yml`](/Users/rapha/Desenvolvimento/X9sales/.github/workflows/ci.yml);
- comando unico local: `npm run ci`.

Observacao: o workflow ainda publica o resultado de `lint`, mas o bloqueio principal da fase atual esta em testes e builds porque o repositorio ainda carrega erros legados fora do escopo desta entrega.

## Fluxo recomendado de desenvolvimento

1. Validar `.env`.
2. Rodar `npm run dev`.
3. Rodar `npm --prefix scanner run dev` quando o fluxo depender de jobs/background.
4. Antes de abrir PR, rodar `npm run ci`.

## Troubleshooting

### Tela de configuracao inicial em vez do app

O frontend mostra a `SetupScreen` quando `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` nao estao definidos.

### Scanner encerra ao iniciar

O scanner falha se `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` estiverem vazios. Verifique [scanner/src/config.ts](/Users/rapha/Desenvolvimento/X9sales/scanner/src/config.ts).

### Build do frontend grande demais

O app usa code-splitting por rota, mas ainda existe codigo compartilhado pesado. Rode `npm run build` para acompanhar os chunks gerados e priorizar novas quebras.

### Dados nao aparecem mesmo com login valido

Cheque:

- membership em `app.company_members`;
- policies/migrations aplicadas;
- seeds executados no ambiente correto;
- variaveis do frontend apontando para o mesmo projeto usado pelo scanner.

## Documentacao util

- [docs/BACKLOG_EXECUTAVEL_30_DIAS.md](/Users/rapha/Desenvolvimento/X9sales/docs/BACKLOG_EXECUTAVEL_30_DIAS.md)
- [docs/PLANO_EXECUCAO_30_DIAS.md](/Users/rapha/Desenvolvimento/X9sales/docs/PLANO_EXECUCAO_30_DIAS.md)
- [docs/ANALISE_DETALHADA_PROJETO.md](/Users/rapha/Desenvolvimento/X9sales/docs/ANALISE_DETALHADA_PROJETO.md)
- [docs/RBAC_OFICIAL.md](/Users/rapha/Desenvolvimento/X9sales/docs/RBAC_OFICIAL.md)
- [docs/ROADMAP_2026.md](/Users/rapha/Desenvolvimento/X9sales/docs/ROADMAP_2026.md)
