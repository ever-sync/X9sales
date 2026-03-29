# Plano de Produto — X9 Sales
> Baseado na análise detalhada da plataforma. Última atualização: 2026-03-28

---

## Visão Geral

A X9 Sales é uma plataforma SaaS de monitoramento de atendimento e análise de qualidade comercial baseada em IA. O foco principal é auditoria automática de conversas no WhatsApp dos vendedores, gerando insights sobre performance, qualidade e oportunidades de melhoria.

**Público-alvo:** Gestores de equipes de vendas e operações comerciais
**Modelo:** SaaS com análise de IA

---

## Status Atual — Funcionalidades Existentes

| Módulo | Status | Observação |
|---|---|---|
| Dashboard | ✅ Funcionando | Métricas de leads, SLA, scores |
| Conversas | ✅ Funcionando | Lista com deduplicação e filtros |
| Atendentes | ✅ Funcionando | Perfil, métricas, histórico |
| Ranking | ✅ Funcionando | Score por atendente |
| Auditoria | ✅ Funcionando | SLA, qualidade IA, risco |
| Analise IA | ✅ Funcionando | Scoring por conversa |
| Revenue Insights | ✅ Funcionando | Pipeline de oportunidades |
| Inteligência de Cliente | ✅ Criado | UI pronta, mock data — sem backend |
| Inteligência de Produto | ✅ Criado | UI pronta, mock data — sem backend |
| Playbooks | ✅ Funcionando | CRUD de playbooks |
| Base de Conhecimento | ✅ Funcionando | RAG integrado |
| Configurações | ✅ Funcionando | Empresa, integrações, usuários |

---

## Pontos Fortes (manter e ampliar)

- Arquitetura de navegação clara: PRINCIPAL / GESTÃO / INTELIGÊNCIA
- Dashboard executivo com visão 360° em uma tela
- Scoring de qualidade IA (clareza, empatia, condução, objetividade)
- Inteligência de Cliente com perfil comportamental e motivadores
- Inteligência de Produto com ranking, dúvidas e objeções por produto
- Sistema de auditoria com detecção de risco Meta/WhatsApp
- Design moderno com identidade visual forte

---

## Problemas Identificados

### Críticos (bloqueiam adoção)
- [ ] Módulos retornam dados zerados quando conta está vazia — usuário não vê valor
- [ ] Sem onboarding — novo usuário não sabe por onde começar
- [ ] Inteligência de Cliente/Produto sem backend real — dados são mock
- [ ] Seção de Vendas vazia — sem integração com sistema de vendas

### Altos (degradam experiência)
- [ ] Alertas sem priorização — alert fatigue com muitos abertos
- [ ] Insights sem ações recomendadas — informação não vira ação
- [ ] Sem comparação entre períodos — impossível medir progresso
- [ ] Sem exportação de dados (PDF/Excel)

### Médios (melhoram retenção)
- [ ] Sem colaboração — plataforma é só visualização, não ação
- [ ] Sem notificações inteligentes proativas
- [ ] Sem benchmarking — gestor não sabe se o score é bom ou ruim
- [ ] Integração WhatsApp não aparece para o usuário

---

## Plano de Execução

---

### FASE 1 — Fundação (Semanas 1-3)
> Objetivo: Resolver o que bloqueia adoção imediata

#### 1.1 Empty States com Dados de Demo
- Quando não há dados reais, mostrar exemplos realistas
- Aplicar em: Revenue Insights, Ranking, Analise IA, Vendas
- Adicionar banner: "Você está vendo dados de exemplo. Conecte sua conta para ver dados reais."
- **Arquivo:** `src/components/ui/EmptyState.tsx` (criar componente reutilizável)

#### 1.2 Onboarding e Primeiros Passos
- Checklist de setup na primeira entrada: conectar WhatsApp, adicionar atendente, criar playbook
- Progress indicator no topo (ex: "3 de 5 passos concluídos")
- Tooltip contextual em funcionalidades não usadas
- **Arquivo:** `src/components/onboarding/SetupChecklist.tsx`

#### 1.3 Priorização de Alertas
- Classificar alertas em: CRÍTICO / ALTO / MÉDIO / BAIXO
- Filtro rápido por prioridade
- Ação em massa: resolver múltiplos alertas de uma vez
- Badge no sidebar mostrando apenas críticos
- **Arquivo:** `src/pages/Alerts.tsx`

#### 1.4 Seção de Integrações Visível
- Mostrar status da conexão WhatsApp na interface
- Guia de troubleshooting inline
- Token de integração com copy fácil
- **Arquivo:** `src/pages/Settings.tsx` (nova aba Integrações)

---

### FASE 2 — Inteligência Real (Semanas 4-8)
> Objetivo: Conectar os módulos de IA ao backend real

#### 2.1 Backend — Inteligência de Cliente
- Criar edge function `customer-intelligence-report`
- Campos a extrair por conversa: intenção, estágio, sensibilidade a preço, urgência, perfil, dúvidas, objeções, motivadores
- Endpoint: `POST /functions/v1/customer-intelligence-report`
- Salvar resultado em nova tabela `customer_intelligence_reports`
- **Migrations:** `00033_customer_intelligence.sql`

#### 2.2 Backend — Inteligência de Produto
- Criar edge function `product-intelligence-report`
- Campos: produto citado, produto de interesse, produtos comparados, dificuldades, barreiras
- Salvar em `product_intelligence_reports`
- **Migrations:** `00034_product_intelligence.sql`

#### 2.3 Conectar Frontend ao Backend
- Substituir mock data pelos hooks de query real em ambas as páginas
- Adicionar filtros de período e atendente
- Estado de loading e erro adequado
- **Arquivos:** `src/pages/CustomerIntelligence.tsx`, `src/pages/ProductIntelligence.tsx`

#### 2.4 Ações Recomendadas
- Para cada insight, mostrar ação concreta sugerida
- Exemplos:
  - "Preço é objeção em 38%" → botão "Criar Playbook de Objeção de Preço"
  - "Score baixo em Investigação" → botão "Ver Conversas com Problema"
  - "Cliente cauteloso" → botão "Abrir Guia de Abordagem"
- **Arquivo:** `src/components/intelligence/ActionRecommendation.tsx`

---

### FASE 3 — Produtividade (Meses 2-3)
> Objetivo: Fechar gaps de workflow e retenção

#### 3.1 Comparação Entre Períodos
- Adicionar seletor: "vs mês anterior" / "vs semana anterior"
- Mostrar delta (+/-) em todos os cards de métricas
- Mini-gráfico de sparkline ao lado de cada métrica
- **Hook:** `src/hooks/usePeriodComparison.ts`

#### 3.2 Exportação de Relatórios
- Exportar para PDF: Dashboard, Auditoria, Ranking
- Exportar para Excel: tabelas de conversas e scores
- Agendamento: relatório automático semanal/mensal por e-mail
- **Biblioteca:** `jspdf` + `xlsx`

#### 3.3 Colaboração — Comentários e Tasks
- Comentários em conversas individuais
- @mentions para atendentes
- Tasks: "Treinar João sobre objeção de preço" — atribuir, prazo, status
- **Migrations:** `00035_collaboration.sql`

#### 3.4 Notificações Inteligentes
- Push notification quando SLA está em risco
- Alerta quando atendente cai abaixo do score mínimo
- Alerta quando padrão negativo emerge (ex: 3 conversas seguidas com score < 60)
- **Arquivo:** `src/hooks/useSmartAlerts.ts`

---

### FASE 4 — Escala (Meses 3-6)
> Objetivo: Diferenciação competitiva e expansão

#### 4.1 Análise Preditiva
- Prever: qual conversa tem risco de perda, qual atendente pode pedir demissão, qual produto vai ter alta demanda
- Modelo: análise de padrões históricos via edge function
- **Depende de:** volume de dados (mínimo 3 meses de histórico)

#### 4.2 Coaching Automático
- Após cada conversa analisada, gerar feedback personalizado para o atendente
- Sugerir exercício específico baseado no ponto mais fraco
- Biblioteca de exemplos de boas práticas (conversas com score > 90)

#### 4.3 Gamificação
- Ranking semanal com badges (Melhor SLA, Melhor Score, Mais Conversas)
- Metas pessoais por atendente
- Leaderboard público no dashboard

#### 4.4 Mobile App
- React Native ou PWA
- Foco: gestores acompanhando em tempo real
- Push notifications de alertas críticos

#### 4.5 Integrações Externas
- CRM: HubSpot, Salesforce, Pipedrive (webhook bidirecional)
- Calendário: Google Calendar (agendar treinamentos automáticos)
- BI: Power BI / Looker Studio (connector)

---

## Problemas Operacionais Ativos

| Problema | Severidade | Responsável |
|---|---|---|
| SLA breaches de 1-4h (João, Ketlleiy, Ramon) | 🔴 Crítico | Gestor |
| Scores 30-50 por falta de investigação | 🟠 Alto | Treinamento |
| Risco Meta — mensagens em massa | 🔴 Crítico | João, Eduarda |
| Seção de Vendas sem registros | 🟡 Médio | Configuração |

---

## Métricas de Sucesso

| Métrica | Baseline | Meta Fase 1 | Meta Fase 2 |
|---|---|---|---|
| Tempo até primeiro valor (onboarding) | Indefinido | < 10 minutos | < 5 minutos |
| Módulos com dados reais | 60% | 80% | 100% |
| Score médio de qualidade da equipe | — | Medir | +10pp |
| Taxa de alertas resolvidos | — | Medir | > 70% |
| SLA cumprido (equipe) | — | Medir | > 85% |

---

## Arquitetura de Dados — Campos IA por Conversa

### Bloco Cliente
```
intencao_principal        texto livre
estagio_funil             pesquisando | comparando | pronto_fechar
nivel_interesse           alto | medio | baixo
sensibilidade_preco       alta | media | baixa
urgencia                  alta | media | baixa
perfil_comportamental     cauteloso | impulsivo | analitico
principais_duvidas        array de strings
principais_objecoes       array de strings
motivadores_compra        array de strings
risco_perda               alto | medio | baixo
```

### Bloco Produto
```
produto_citado            string
produto_interesse         string
produtos_comparados       array de strings
motivo_interesse          string
dificuldade_entendimento  alto | medio | baixo
barreiras_produto         array de strings
```

### Bloco Atendimento
```
qualidade_conducao        score 0-100
houve_avanco              boolean
objecao_tratada           boolean
oportunidade_perdida      boolean
```

---

## Roadmap Visual

```
2026 Q1 (Mar-Abr)     | FASE 1 — Fundação
  Semana 1-2          | Empty states + Onboarding
  Semana 3            | Priorização alertas + Integrações visíveis

2026 Q2 (Abr-Jun)     | FASE 2 — Inteligência Real
  Semana 4-6          | Backend Customer + Product Intelligence
  Semana 7-8          | Frontend conectado + Ações Recomendadas

2026 Q2-Q3 (Jun-Ago)  | FASE 3 — Produtividade
  Mês 2               | Comparação períodos + Exportação
  Mês 3               | Colaboração + Notificações inteligentes

2026 Q4 (Set-Dez)     | FASE 4 — Escala
  Mês 4-5             | Análise preditiva + Coaching automático
  Mês 6               | Mobile + Integrações CRM
```

---

## Próximos Passos Imediatos

1. [ ] Criar componente `EmptyState` reutilizável com dados de demo
2. [ ] Criar `SetupChecklist` de onboarding para novos usuários
3. [ ] Implementar priorização de alertas (CRÍTICO/ALTO/MÉDIO/BAIXO)
4. [ ] Tornar status da integração WhatsApp visível nas Configurações
5. [ ] Definir schema das tabelas `customer_intelligence_reports` e `product_intelligence_reports`
