# X9 Sales — Roadmap e Plano de Produto 2026
> Versão consolidada · Auditoria completa do codebase · Última atualização: 2026-03-29

---

## 1. O Produto em Uma Frase

A **X9 Sales** é uma plataforma SaaS B2B de inteligência comercial que monitora conversas de WhatsApp em tempo real, avalia qualidade de atendimento via IA, identifica oportunidades de venda e gera coaching automático para equipes comerciais.

---

## 2. Estado Real do Produto Hoje

### 2.1 Módulos e Status

| Módulo | Página | Dados | Estado |
|--------|--------|-------|--------|
| Dashboard Admin | `Dashboard.tsx` | ✅ Real | Funcionando bem |
| Painel do Atendente | `AgentDashboard.tsx` | ⚠️ Parcial | Metas, funil e ações = hardcoded |
| Conversas | `Conversations.tsx` | ✅ Real | Escala ruim (dedup em memória) |
| Detalhe da Conversa | `ConversationDetail.tsx` | ✅ Real | Funcionando bem |
| Atendentes | `Agents.tsx` | ✅ Real | Stats ao vivo |
| Perfil do Atendente | `AgentDetail.tsx` | ✅ Real | Funcionando bem |
| Vendas | `Sales.tsx` | ✅ Real | Isolamento por agente implementado |
| Revenue Insights | `RevenueInsights.tsx` | ✅ Real | Polling em modal (sem real-time) |
| Análise IA | `AIInsights.tsx` | ✅ Real | Sem paginação (limite 80) |
| Performance | `Performance.tsx` | ✅ Real | Recém implementado |
| Ranking | `Ranking.tsx` | ⚠️ Misto | Fallback com demo data hardcoded |
| Auditoria | `Audit.tsx` | ✅ Real | Limite 20 itens |
| Alertas | `Alerts.tsx` | ✅ Real | Severidade + filtros funcionando |
| **Inteligência de Cliente** | `CustomerIntelligence.tsx` | ❌ Mock | 458 linhas de UI, zero queries |
| **Inteligência de Produto** | `ProductIntelligence.tsx` | ❌ Mock | 365 linhas de UI, zero queries |
| Playbooks | `Playbooks.tsx` | ✅ Real | CRUD ok, sem integração nas conversas |
| Base de Conhecimento | `KnowledgeBase.tsx` | ✅ Real | Sem editor rico, type cast frágil |
| Configurações | `Settings.tsx` | ✅ Real | Logo upload não implementado |

### 2.2 Infraestrutura de Backend

| Camada | Status | Observação |
|--------|--------|------------|
| 35 migrations (PostgreSQL) | ✅ | Schema completo |
| 26 edge functions (Serverless) | ✅ | Cobertura completa |
| 5 materialized views | ✅ | Refresh automático a cada 5min |
| RBAC + RLS multi-tenant | ✅ | Sólido, por empresa |
| Stripe Billing | ✅ | Checkout, portal, webhooks |
| Supabase Auth | ✅ | Email/password |
| PWA + BottomNav mobile | ✅ | Recém implementado |

### 2.3 Roles e Permissões

**owner_admin** — acesso total a todos os módulos
**agent** — acesso restrito ao próprio painel, suas conversas, suas vendas e performance pessoal

---

## 3. Os 5 Problemas Críticos

### P1 — Inteligência de Cliente e Produto são vitrines sem dados
- **Impacto:** Dois dos módulos mais diferenciados do produto são 100% falsos
- **Realidade:** O backend está 100% pronto (migrations 00033/00034, edge function `intelligence-report`)
- **Causa:** O frontend nunca foi conectado ao banco

### P2 — AgentDashboard é quase inteiro hardcoded
- **Impacto:** O painel principal do atendente mostra metas fictícias e funil inventado
- **Dados disponíveis:** `sales_records`, `metrics_agent_daily`, `mv_agent_ranking`, `ai_conversation_analysis`
- **Causa:** Nunca foi bindado à camada de dados

### P3 — Playbooks não aparecem nas conversas
- **Impacto:** O gestor cria playbooks mas o atendente nunca os vê em ação
- **O que existe:** CRUD completo, regras com peso, publicação; mas zero integração no `ConversationDetail`
- **Causa:** A tela de detalhe da conversa não consulta `playbook_rules`

### P4 — Jobs de IA sem feedback em tempo real
- **Impacto:** Análise de IA e Revenue Copilot usam polling num modal fechado — UX antiquado
- **O que existe:** Supabase Realtime disponível, `send-push-alert` edge function pronta
- **Causa:** Não foi implementado subscribe via Realtime

### P5 — Conversas com deduplicação em memória
- **Impacto:** Carrega 500 rows no browser e agrupa via JavaScript — vai travar com times grandes
- **Solução:** Mover a lógica de agrupamento para SQL com `DISTINCT ON` ou window functions

---

## 4. Roadmap de Execução

---

### FASE 1 — Conectar o Backend (Semanas 1–2)
> **Objetivo:** Eliminar todo dado falso. Cada tela deve consumir dados reais.

#### 1.1 Inteligência de Cliente — Conectar ao backend
- **O que fazer:** Substituir todo conteúdo estático por queries reais a `customer_intelligence_reports`
- **Queries:** filtro por `company_id`, `agent_id`, período; agregações por `intencao_principal`, `estagio_funil`, `perfil_comportamental`, `sensibilidade_preco`
- **Arquivo:** `src/pages/CustomerIntelligence.tsx`
- **Backend pronto:** migration `00033`, edge function `intelligence-report`
- **Complexidade:** Média

#### 1.2 Inteligência de Produto — Conectar ao backend
- **O que fazer:** Substituir mock data por queries a `product_intelligence_reports`
- **Queries:** filtro por produto, período, agent; ranking de produtos, objeções mais frequentes, barreiras de entendimento
- **Arquivo:** `src/pages/ProductIntelligence.tsx`
- **Backend pronto:** migration `00034`, edge function `intelligence-report`
- **Complexidade:** Média

#### 1.3 AgentDashboard — Bindear dados reais
- **O que fazer:** Conectar metas, funil, vendas e ranking a dados reais
- **Queries necessárias:**
  - Metas do mês: `sales_records` agregado por `seller_agent_id`
  - Funil (leads → proposta → fechamento): `deal_signals` por `agent_id` e `stage`
  - Próximas ações: `deal_signals` com `loss_risk_level = alto` ordenados por `estimated_value DESC`
  - Score pessoal: `mv_agent_ranking` filtrado por `agent_id`
  - Coaching pendente: `ai_conversation_analysis` onde `needs_coaching = true`
- **Arquivo:** `src/pages/AgentDashboard.tsx`
- **Complexidade:** Média

#### 1.4 Ranking — Remover fallback demo
- **O que fazer:** Substituir `DEMO_AGENTS` por um `EmptyState` adequado quando não há dados reais
- **Arquivo:** `src/pages/Ranking.tsx`
- **Complexidade:** Baixa

---

### FASE 2 — Conectar Insight à Ação (Semanas 3–4)
> **Objetivo:** Transformar dashboards descritivos em ferramentas prescritivas — cada insight deve ter uma ação disponível.

#### 2.1 Playbooks no ConversationDetail
- **O que fazer:** Ao abrir uma conversa, buscar `playbook_rules` da empresa e comparar com o contexto (`deal_signals.stage`, tags, score)
- **UI:** Drawer lateral ou seção "Guia de Atendimento" com as regras ativas do playbook mais relevante
- **Lógica:** `playbook_rules` ordenados por `weight DESC`, filtrados pela `stage` atual do `deal_signal`
- **Arquivos:** `src/pages/ConversationDetail.tsx`, nova query em `playbooks`
- **Complexidade:** Alta

#### 2.2 CTAs de Ação nos Insights
- **O que fazer:** Para cada insight nas páginas de Inteligência e nos Alertas, adicionar botão de ação contextual
- **Exemplos:**
  - "Preço é objeção em 38% das conversas" → **[Criar Playbook de Objeção]**
  - "Score baixo em Investigação" → **[Ver Conversas com Problema]**
  - "Atendente João precisa de coaching" → **[Abrir Copilot do Gestor]**
  - "Risco de banimento Meta detectado" → **[Ver Conversa / Bloquear]**
- **Integração:** Botões chamam `ask-manager-copilot` ou redirecionam com filtros pré-aplicados
- **Arquivos:** `CustomerIntelligence.tsx`, `ProductIntelligence.tsx`, `Alerts.tsx`, `AIInsights.tsx`
- **Complexidade:** Média

#### 2.3 Comparação entre Períodos
- **O que fazer:** Mostrar delta (+/-) em todos os KPI cards comparando com período anterior
- **Hook:** `src/hooks/usePeriodComparison.ts`
- **Lógica:** Duas queries paralelas (período atual vs. período anterior), calcula `(atual - anterior) / anterior * 100`
- **UI:** Seta verde/vermelha com percentual ao lado de cada métrica
- **Aplicar em:** Dashboard, Performance, AgentDashboard, AgentDetail
- **Complexidade:** Média

---

### FASE 3 — Real-time e Notificações (Semanas 5–6)
> **Objetivo:** A plataforma avisa proativamente em vez de esperar o gestor verificar.

#### 3.1 Jobs de IA com Supabase Realtime
- **O que fazer:** Substituir polling por `supabase.channel().on('postgres_changes')` nas tabelas `ai_analysis_jobs` e `revenue_copilot_jobs`
- **UI:** Progress bar animada em vez de modal spinner com polling
- **Arquivos:** `src/pages/AIInsights.tsx`, `src/pages/RevenueInsights.tsx`
- **Complexidade:** Média

#### 3.2 Notificações Push para Alertas Críticos
- **O que fazer:** Edge function `send-push-alert` já existe — conectar ao frontend
- **Trigger:** Quando `alert.severity = critical` é criado, disparar push notification
- **Canais:** Web Push (PWA) + email para o `owner_admin`
- **Config:** Preferências em `Settings.tsx` (já existe campo de notificações)
- **Complexidade:** Média

#### 3.3 Alerta Preditivo (Score em Queda)
- **O que fazer:** Cron job que analisa `ai_conversation_analysis` das últimas 3 sessões de um atendente
- **Regra:** Se score < 50 por 3 análises consecutivas → gerar alerta `severity = high` com `type = COACHING_NEEDED`
- **Backend:** Nova edge function `monitor-score-trend` + trigger agendado no Supabase
- **Complexidade:** Alta

---

### FASE 4 — Produtividade e Escala (Meses 2–3)
> **Objetivo:** Fechar gaps de workflow que impedem uso diário intenso.

#### 4.1 Exportação de Relatórios
- **O que fazer:** Botão "Exportar" em Dashboard, Ranking, Auditoria e AIInsights
- **Formatos:** PDF (jsPDF) para relatórios executivos, Excel (xlsx) para tabelas de dados
- **Relatório agendado:** Envio automático semanal/mensal por email (via `queue-notification-jobs`)
- **Complexidade:** Baixa

#### 4.2 Colaboração — Comentários em Conversas
- **O que fazer:** Adicionar thread de comentários internos no `ConversationDetail`
- **Migration:** `00036_conversation_comments.sql` com tabela `conversation_comments(id, conversation_id, author_id, body, created_at)`
- **UI:** Mini-chat no sidebar direito da tela de conversa
- **@mentions:** Notificar atendente quando gestor comenta com `@nome`
- **Complexidade:** Alta

#### 4.3 Deduplicação de Conversas no Banco
- **O que fazer:** Mover a lógica de `GROUP BY phone/customer` para uma query SQL
- **Solução:** `DISTINCT ON (customer_id)` com `ORDER BY started_at DESC` ou view específica
- **Impacto:** Reduz de 500 rows para N clientes únicos — melhora performance e escalabilidade
- **Arquivo:** `src/pages/Conversations.tsx`
- **Complexidade:** Média

#### 4.4 Gamificação do Ranking
- **O que fazer:** Badges semanais automáticos (Melhor SLA, Maior Score, Mais Conversas, Maior Receita)
- **UI:** Cards de conquista no AgentDashboard e perfil do atendente
- **Backend:** Edge function semanal que avalia `mv_agent_ranking` e grava badges
- **Migration:** `00037_agent_badges.sql`
- **Complexidade:** Média

#### 4.5 Logo Upload na Empresa
- **O que fazer:** Implementar upload para Supabase Storage no Settings
- **Campo já existe:** `companies.logo_url` está no schema
- **Complexidade:** Baixa

---

### FASE 5 — Diferenciação (Meses 4–6)
> **Objetivo:** Features que tornam a X9 impossível de copiar no curto prazo.

#### 5.1 Coaching Automático Pós-Análise
- **O que fazer:** Após cada análise de IA, gerar feedback personalizado e exercício específico para o atendente
- **Regra:** Se `score_investigation < 60` → enviar playbook de investigação + exemplo de conversa com score > 90 no mesmo pilar
- **Backend:** Expandir `run-ai-analysis` para incluir etapa de coaching
- **UI:** Seção "Seu Coaching desta Semana" no AgentDashboard
- **Complexidade:** Alta

#### 5.2 Análise Preditiva de Perda
- **O que fazer:** Identificar conversas com alta probabilidade de abandono antes que aconteça
- **Modelo:** Padrão de `deal_signals` (loss_risk_level subindo, tempo sem resposta, estágio estagnado)
- **Depende de:** Mínimo 3 meses de histórico de dados
- **Complexidade:** Alta

#### 5.3 Integrações CRM
- **O que fazer:** Webhook bidirecional com HubSpot, Pipedrive e Salesforce
- **Fluxo:** Deal ganho na X9 → atualiza oportunidade no CRM; lead novo no CRM → cria conversa na X9
- **Complexidade:** Alta

#### 5.4 Mobile App Nativo
- **Base:** PWA já implementado (manifest + BottomNav)
- **Escopo:** Gestor vê alertas críticos, KPIs do dia, e pode abrir copilot em tempo real
- **Tecnologia:** React Native (reaproveitando lógica) ou Progressive Web App refinado
- **Complexidade:** Alta

---

## 5. Backlog Técnico (Dívidas)

| Problema | Impacto | Esforço | Ação |
|----------|---------|---------|------|
| Deduplicação em memória nas Conversas | Alto | Médio | Mover para SQL |
| `as any` no KnowledgeBase | Baixo | Baixo | Criar tipo correto |
| Logo upload em Settings | Baixo | Baixo | Supabase Storage |
| Polling em jobs de IA | Médio | Médio | Supabase Realtime |
| Validação de formulários (Settings, Agents) | Médio | Baixo | zod + react-hook-form |
| Playbooks sem feedback de uso | Alto | Alto | Integrar no ConversationDetail |
| Limite de 80 itens no AIInsights | Médio | Baixo | Paginação |
| Ranking com demo data | Baixo | Baixo | EmptyState adequado |

---

## 6. Métricas de Sucesso

| Métrica | Hoje | Meta Fase 1-2 | Meta Fase 3-4 |
|---------|------|---------------|---------------|
| Módulos com dados 100% reais | 65% | 100% | 100% |
| Tempo até primeiro insight (onboarding) | ~10 min | < 5 min | < 3 min |
| Score médio de qualidade da equipe | — | Medindo | +10pp |
| Taxa de alertas críticos resolvidos | — | > 60% | > 80% |
| SLA cumprido (equipe) | — | Medindo | > 85% |
| Atendentes usando o painel diariamente | — | > 70% | > 90% |
| Tempo médio de resposta (FRT) | — | Medindo | Redução 20% |

---

## 7. Próximos 10 Passos Imediatos

```
[ ] 1. Conectar CustomerIntelligence ao backend (intelligence-report)
[ ] 2. Conectar ProductIntelligence ao backend (intelligence-report)
[ ] 3. Bindar AgentDashboard: funil real via deal_signals
[ ] 4. Bindar AgentDashboard: metas reais via sales_records
[ ] 5. Remover demo data do Ranking → EmptyState
[ ] 6. CTAs de ação nos Alertas críticos
[ ] 7. Comparação de períodos em KPI cards (hook usePeriodComparison)
[ ] 8. Playbooks aparecendo no ConversationDetail
[ ] 9. Realtime nos jobs de IA (AIInsights + RevenueInsights)
[ ] 10. Exportação PDF no Dashboard e Ranking
```

---

## 8. Roadmap Visual

```
2026 Q1 (Mar–Abr)
  Semana 1–2    │ FASE 1 — Conectar dados reais
                │   CustomerIntelligence, ProductIntelligence, AgentDashboard
  Semana 3–4    │ FASE 2 — Insight → Ação
                │   Playbooks em Conversas, CTAs, Comparação de Períodos

2026 Q2 (Abr–Jun)
  Semana 5–6    │ FASE 3 — Real-time e Notificações
                │   Supabase Realtime, Push Alerts, Alerta Preditivo
  Semana 7–10   │ FASE 4 — Produtividade
                │   Exportação, Colaboração, Gamificação, Deduplicação SQL

2026 Q3 (Jul–Set)
  Mês 4–5       │ FASE 5 — Diferenciação
                │   Coaching automático, Análise preditiva, Integrações CRM

2026 Q4 (Out–Dez)
  Mês 6         │ Mobile, Integrações avançadas, Multi-idioma
```

---

## 9. Decisões de Arquitetura — Manter

- **Supabase** como backend único (PostgreSQL + Edge Functions + Auth + Storage + Realtime)
- **Materialized views** para dashboards — nunca calcular KPIs on-demand
- **React Query** para cache — nunca fazer fetch sem staleTime configurado
- **RLS por empresa** — nunca confiar em filtros só no frontend
- **Edge Functions Serverless** para jobs pesados — nunca bloquear a UI
- **TypeScript strict** — nunca usar `as any` em novos arquivos

---

*Documento gerado a partir de auditoria completa do codebase em 2026-03-29.*
*Substitui: `ANALISE_DIAGNOSTICA.md` e `PLANO_PRODUTO.md`*
