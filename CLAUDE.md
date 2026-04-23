# CLAUDE.md — X9sales

> Este arquivo é lido automaticamente pelo Claude, Cursor e outros assistentes de IA ao abrir este projeto.
> Mantenha-o atualizado — ele é o "briefing" que a IA recebe antes de qualquer conversa.

---

## 🎯 O que é este projeto

> **Tipo:** frontend
> **Versão:** 0.0.0
> **Descrição:** Preencha com uma descrição clara do que o projeto faz e para quem

---

## ⚡ Stack

```
TypeScript + React + Vite
```

- **Frontend:** React
- **Bundler:** Vite
- **Language:** TypeScript

---

## 📁 Estrutura principal

```
X9sales/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── services/



├── .env
└── package.json
```

---

## 📐 Convenções do projeto

- TypeScript strict — nunca usar `any` sem justificativa
- Variáveis sensíveis sempre no `.env` — nunca hardcoded

---

## 🔌 Integrações externas

- Nenhuma detectada automaticamente

---

## 🔐 Variáveis de ambiente necessárias

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCANNER_CRON`
- `SCANNER_AGGREGATOR_CRON`
- `SCANNER_SPAM_CRON`
- `SCANNER_AI_JOBS_CRON`
- `SCANNER_REVENUE_COPILOT_CRON`
- `SCANNER_MANAGER_COPILOT_CRON`
- `SCANNER_DAILY_AI_FULL_SCAN_CRON`
- `SCANNER_BATCH_SIZE`
- `SCANNER_MAX_RETRIES`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `WEBHOOK_SECRET`
- `APP_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `RESEND_API_KEY`
- `UAZAPI_BASE_URL`
- `UAZAPI_INSTANCE`
- `UAZAPI_TOKEN`
- `WHATSAPP_NOTIFY_PHONE`

---

## ✅ Status atual das features

> Atualize conforme o progresso

| Feature | Status | Observação |
|---------|--------|------------|
| Setup inicial | ✅ Pronto | |
| Autenticação | ❓ | |
| CRUD principal | ❓ | |
| Deploy | ❓ | |

---

## ⚠️ O que NÃO fazer neste projeto

- Não commitar arquivos `.env`
- Não criar lógica de negócio dentro das rotas (usar controllers/services)
- Não usar `any` sem comentário explicando o motivo


---

## 🧠 Contexto para a IA

Quando for ajudar neste projeto:
1. Siga as convenções de estrutura de pastas acima
2. Use TypeScript em todo código novo
3. Mantenha consistência com os padrões já existentes
4. Pergunte antes de refatorar arquivos existentes
5. Prefira soluções simples a abstrações desnecessárias

---

## 🔗 Projetos relacionados

- [[EverSync]] — agência responsável pelo projeto
- Adicione links para projetos relacionados aqui

---

*Gerado automaticamente em 2026-04-16 — edite conforme necessário*
