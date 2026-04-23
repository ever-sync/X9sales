# Backlog Executavel 30 Dias

Data: 2026-04-21
Base: [Plano de Execucao 30 Dias](./PLANO_EXECUCAO_30_DIAS.md)

## Como usar este documento

Este backlog foi montado para virar:

- issues;
- cards de sprint;
- PRs pequenos e rastreaveis;
- checklist de acompanhamento semanal.

Cada item abaixo traz:

- objetivo;
- escopo;
- definicao de pronto;
- dependencias;
- sugestao de PR.

## Ordem recomendada de execucao

1. `rbac-alignment`
2. `react-stability-foundation`
3. `settings-refactor`
4. `dashboard-aiinsights-refactor`
5. `functions-shared-kit`
6. `ci-and-tests`
7. `readme-and-onboarding`
8. `route-code-splitting`

## Sprint 1

## Tarefa 1. Definir RBAC oficial

Status: concluida

### Objetivo

Fechar de vez qual e o modelo oficial de papeis do produto e remover ambiguidade entre frontend, banco e functions.

### Escopo

- confirmar papeis suportados hoje;
- registrar isso em documento tecnico curto;
- identificar todos os pontos que ainda usam papeis legados.

### Arquivos para revisar

- `src/types/index.ts`
- `src/config/constants.ts`
- `src/hooks/usePermissions.ts`
- `supabase/migrations/00004_rls_policies.sql`
- `supabase/migrations/00028_consolidate_workspace_roles.sql`
- `supabase/functions/ask-manager-copilot/index.ts`
- `supabase/functions/update-company-member-role/index.ts`

### Definicao de pronto

- documento curto com o RBAC oficial;
- lista fechada dos pontos que precisarao ser alterados;
- nenhuma duvida em aberto sobre quais papeis existem.

### Dependencias

- nenhuma

### PR sugerido

- `rbac-alignment/01-rbac-definition`

## Tarefa 2. Alinhar frontend com RBAC oficial

Status: concluida

### Objetivo

Garantir que tipos, constantes e hooks usem o mesmo contrato de permissao.

### Escopo

- ajustar tipos de role;
- ajustar constantes de role level;
- revisar `usePermissions`;
- validar rotas protegidas.

### Definicao de pronto

- frontend sem referencias a papel obsoleto;
- tipos e constantes coerentes;
- regras de permissao rastreaveis.
- RBAC centralizado em uma unica fonte de verdade no frontend.

### Dependencias

- Tarefa 1

### PR sugerido

- `rbac-alignment/02-frontend-contract`

## Tarefa 3. Alinhar banco e Edge Functions com RBAC oficial

Status: concluida

### Objetivo

Remover divergencia entre migrations, RLS e functions.

### Escopo

- revisar helper functions SQL;
- revisar politicas de acesso;
- revisar functions que ainda aceitam roles antigas;
- validar fluxos de `owner_admin` e `agent`.

### Definicao de pronto

- migrations e functions coerentes com o RBAC oficial;
- nenhum endpoint critico aceitando papeis fora do contrato;
- sem conflito entre frontend e backend na resolucao de acesso.
- migration de consolidacao adicionada para ambientes com legado.

### Dependencias

- Tarefa 1

### PR sugerido

- `rbac-alignment/03-backend-rbac-sync`

## Tarefa 4. Corrigir erros de React mais perigosos

### Objetivo

Reduzir risco de comportamento instavel no frontend antes de refatorar telas maiores.

### Escopo

- remover `setState` em efeitos quando o valor pode ser derivado;
- corrigir hooks condicionais;
- remover chamadas impuras em render;
- ajustar dependencias de hooks com maior risco.

### Arquivos prioritarios

- `src/components/layout/MainLayout.tsx`
- `src/contexts/CompanyContext.tsx`
- `src/components/copilot/ManagerCopilotWidget.tsx`
- `src/pages/AIInsights.tsx`
- `src/pages/AgentDetail.tsx`
- `src/pages/Playbooks.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Coach.tsx`

### Definicao de pronto

- erros de lint mais perigosos eliminados;
- base de navegacao e estado mais previsivel;
- queda forte no total de erros.

### Dependencias

- nenhuma, mas idealmente em paralelo com Tarefas 2 e 3

### PR sugerido

- `react-stability-foundation/01-effects-hooks-purity`

## Sprint 2

## Tarefa 5. Quebrar `Settings.tsx` em modulos

### Objetivo

Transformar a pagina mais critica do projeto em estrutura modular e sustentavel.

### Escopo

- extrair tabs para componentes independentes;
- extrair hooks de query/mutation;
- separar tipos e utilitarios locais;
- reduzir responsabilidade do arquivo principal.

### Estrutura sugerida

- `src/pages/settings/SettingsPage.tsx`
- `src/pages/settings/components/`
- `src/pages/settings/hooks/`
- `src/pages/settings/types.ts`
- `src/pages/settings/utils.ts`

### Definicao de pronto

- arquivo original drasticamente reduzido;
- tabs isoladas por responsabilidade;
- hooks sempre chamados em ordem valida;
- leitura muito mais simples.

### Dependencias

- Tarefa 4

### PR sugerido

- `settings-refactor/01-module-split`

## Tarefa 6. Refatorar `Dashboard.tsx`

### Objetivo

Separar consulta, transformacao e renderizacao da home principal.

### Escopo

- extrair queries;
- extrair transforms de dados;
- extrair cards e secoes grandes;
- tipar joins e relations melhor.

### Definicao de pronto

- dashboard dividido em secoes reutilizaveis;
- transformacoes centralizadas;
- menos `any` e menos logica inline.

### Dependencias

- Tarefa 4

### PR sugerido

- `dashboard-aiinsights-refactor/01-dashboard-split`

## Tarefa 7. Refatorar `AIInsights.tsx`

### Objetivo

Reduzir complexidade da tela de analise IA e melhorar previsibilidade dos fluxos.

### Escopo

- extrair modal flow;
- extrair filtros e paginação;
- extrair queries;
- remover efeitos com sincronizacao fraca.

### Definicao de pronto

- fluxo da pagina entendido por modulos;
- menos efeito colateral espalhado;
- arquivo principal bem menor.

### Dependencias

- Tarefa 4

### PR sugerido

- `dashboard-aiinsights-refactor/02-aiinsights-split`

## Tarefa 8. Refatorar `AgentDetail.tsx`

### Objetivo

Reduzir custo de manutencao da tela detalhada de atendente.

### Escopo

- separar secoes analiticas;
- rever memoizacoes problemáticas;
- ajustar tipos e calculos derivados;
- isolar blocos de avatar, performance, coaching e vendas.

### Definicao de pronto

- tela modular;
- memoizacao mais confiavel;
- menos warnings do compilador/lint.

### Dependencias

- Tarefa 4

### PR sugerido

- `dashboard-aiinsights-refactor/03-agentdetail-split`

## Sprint 3

## Tarefa 9. Criar kit compartilhado para Edge Functions

### Objetivo

Eliminar duplicacao sistemica nas functions sensiveis.

### Escopo

- criar modulos reutilizaveis em `supabase/functions/_shared/`;
- auth header parsing;
- bearer token extraction;
- body parsing helpers;
- validacao de periodo;
- helpers de company/agent ownership;
- normalizacao de telefone;
- filtros de bloqueio.

### Definicao de pronto

- contrato compartilhado criado;
- documentacao minima do kit;
- funcoes novas passam a usar esse caminho por padrao.

### Dependencias

- Tarefa 1

### PR sugerido

- `functions-shared-kit/01-shared-helpers`

## Tarefa 10. Migrar functions criticas para o kit compartilhado

### Objetivo

Aplicar o kit compartilhado nas functions com maior repeticao.

### Escopo

- `run-ai-analysis`
- `run-revenue-copilot`
- `run-product-intelligence`
- `run-seller-audit`
- `generate-roi-report`
- `ask-manager-copilot`

### Definicao de pronto

- repeticao sensivelmente reduzida;
- validacoes centralizadas;
- manutencao futura mais barata.

### Dependencias

- Tarefa 9

### PR sugerido

- `functions-shared-kit/02-adopt-shared-helpers`

## Tarefa 11. Reduzir `any` nas camadas de maior risco

### Objetivo

Recuperar valor real do TypeScript onde ele mais importa.

### Escopo

- joins de Supabase no frontend;
- payloads das functions;
- transforms de dashboard, insights e settings;
- processors e agregadores mais sensiveis.

### Definicao de pronto

- principais `any` removidos dos fluxos criticos;
- types reutilizaveis introduzidos;
- menos casting defensivo solto.

### Dependencias

- Tarefas 5, 6, 7, 9

### PR sugerido

- `typing-hardening/01-critical-paths`

## Sprint 4

## Tarefa 12. Adicionar testes minimos

### Objetivo

Criar primeira rede de seguranca para refatoracao e evolucao.

### Escopo

- escolher stack de teste;
- criar setup minimo;
- cobrir utilitarios e validadores;
- cobrir transforms puras extraidas das paginas.

### Candidatos iniciais

- formatadores;
- validadores de periodo;
- normalizacao de telefone;
- transforms de dashboard;
- resolucao de permissoes.

### Definicao de pronto

- suite minima rodando localmente;
- testes simples cobrindo funcoes puras prioritarias;
- script de teste presente no projeto.

### Dependencias

- Tarefas 4, 9

### PR sugerido

- `ci-and-tests/01-test-foundation`

## Tarefa 13. Configurar CI

### Objetivo

Automatizar o gate basico de qualidade.

### Escopo

- instalar dependencias;
- rodar lint;
- rodar build frontend;
- rodar build scanner;
- rodar testes.

### Definicao de pronto

- pipeline versionada no repositorio;
- falha automatica quando qualidade minima quebra;
- documentacao simples de como interpretar a pipeline.

### Dependencias

- Tarefa 12

### PR sugerido

- `ci-and-tests/02-ci-pipeline`

## Tarefa 14. Reescrever README e onboarding

### Objetivo

Fazer o repositorio explicar o produto real e permitir setup sem conhecimento oral.

### Escopo

- reescrever README;
- remover partes herdadas do template Vite;
- explicar frontend, scanner, Supabase e docs;
- revisar links quebrados;
- adicionar troubleshooting basico.

### Definicao de pronto

- README orientado ao produto;
- setup compreensivel para novo dev;
- referencias quebradas corrigidas.

### Dependencias

- nenhuma tecnica forte

### PR sugerido

- `readme-and-onboarding/01-readme-refresh`

## Tarefa 15. Implementar lazy loading nas rotas pesadas

### Objetivo

Reduzir peso do bundle inicial sem alterar comportamento de negocio.

### Escopo

- lazy load por pagina em `src/App.tsx`;
- revisar imports pesados;
- medir build antes e depois;
- registrar resultado no PR.

### Rotas candidatas

- `Settings`
- `AIInsights`
- `Dashboard`
- `AgentDetail`
- `MarketingLanding`

### Definicao de pronto

- bundle principal reduzido;
- paginas continuam funcionando normalmente;
- comparativo de build registrado.

### Dependencias

- Tarefas 5, 6, 7, 8 ajudam bastante, mas nao sao obrigatorias

### PR sugerido

- `route-code-splitting/01-lazy-routes`

## Checklist de acompanhamento semanal

## Semana 1

- RBAC oficial definido
- Frontend alinhado ao contrato
- Banco/functions alinhados ao contrato
- Erros de React mais perigosos corrigidos

## Semana 2

- `Settings` modularizado
- `Dashboard` modularizado
- `AIInsights` modularizado
- `AgentDetail` iniciado ou concluido

## Semana 3

- kit compartilhado de functions criado
- functions criticas migradas
- `any` reduzido nos fluxos mais sensiveis

## Semana 4

- testes minimos adicionados
- CI configurada
- README refeito
- lazy loading implementado

## Kanban sugerido

### Todo

- Tarefa 1
- Tarefa 4
- Tarefa 14

### Em seguida

- Tarefa 2
- Tarefa 3
- Tarefa 5

### Depois

- Tarefa 6
- Tarefa 7
- Tarefa 8
- Tarefa 9
- Tarefa 10

### Fechamento do ciclo

- Tarefa 11
- Tarefa 12
- Tarefa 13
- Tarefa 15

## Melhor ponto de partida agora

Se for para abrir o primeiro pacote de trabalho imediatamente, a melhor combinacao e:

1. Tarefa 1
2. Tarefa 4
3. Tarefa 14

Essa combinacao cria clareza arquitetural, reduz risco tecnico e melhora onboarding sem depender de uma refatoracao longa logo de cara.
