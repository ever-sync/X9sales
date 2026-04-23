# Plano de Execucao 30 Dias

Data: 2026-04-21
Base: [Analise detalhada do projeto](./ANALISE_DETALHADA_PROJETO.md) + [Roadmap 2026](./ROADMAP_2026.md)

## Objetivo

Organizar os proximos 30 dias para aumentar confiabilidade, reduzir risco tecnico e preparar o projeto para crescer sem acumular mais debito estrutural.

Este plano nao substitui o roadmap de produto. Ele funciona como plano tatico de estabilizacao e aceleracao.

## Resultado Esperado em 30 Dias

Ao final deste ciclo, o projeto deve chegar em um estado onde:

- o modelo de papeis e permissoes esteja consistente;
- `lint` esteja limpo ou muito proximo de zero erros;
- os principais arquivos criticos tenham comecado a ser modularizados;
- exista um minimo de testes e CI;
- o onboarding tecnico esteja documentado;
- o frontend esteja melhor preparado para code-splitting e evolucao segura.

## Prioridades do Ciclo

### P1. Confiabilidade

- unificar RBAC;
- corrigir erros reais de Hooks e render;
- estabilizar fluxos criticos do frontend.

### P2. Manutenibilidade

- quebrar arquivos gigantes;
- extrair logica duplicada nas Edge Functions;
- reduzir `any` nas partes mais sensiveis.

### P3. Qualidade de entrega

- adicionar testes minimos;
- configurar CI;
- atualizar README e docs de setup.

### P4. Performance

- preparar lazy loading por rota;
- reduzir peso do bundle principal.

## Plano por Semana

## Semana 1

### Meta

Eliminar os maiores riscos de inconsistencia e criar uma base confiavel para o restante do ciclo.

### Entregas

- Definir oficialmente o modelo de papeis suportado no produto.
- Alinhar `src/types`, `src/config/constants`, hooks, functions e migrations com esse modelo.
- Mapear e corrigir os erros de lint mais perigosos:
  - `setState` em `useEffect` quando o estado pode ser derivado;
  - hooks condicionais;
  - chamadas impuras em render;
  - dependencias incorretas de hooks.
- Revisar `CompanyContext` e `MainLayout` para remover efeitos desnecessarios.

### Arquivos prioritarios

- `src/contexts/CompanyContext.tsx`
- `src/components/layout/MainLayout.tsx`
- `src/hooks/usePermissions.ts`
- `src/types/index.ts`
- `src/config/constants.ts`
- `supabase/functions/ask-manager-copilot/index.ts`
- `supabase/functions/update-company-member-role/index.ts`
- `supabase/migrations/00004_rls_policies.sql`
- `supabase/migrations/00028_consolidate_workspace_roles.sql`

### Criterio de pronto

- modelo de papel documentado e refletido nas camadas principais;
- nenhum fluxo critico dependente de regra de permissao ambigua;
- queda visivel na quantidade de erros de lint.

## Semana 2

### Meta

Reduzir acoplamento do frontend nos arquivos mais perigosos e recuperar legibilidade.

### Entregas

- Iniciar refatoracao de `Settings.tsx`.
- Extrair subcomponentes por aba e hooks de dados por dominio.
- Iniciar refatoracao de `Dashboard.tsx` e `AIInsights.tsx`.
- Remover `any` de consultas e transforms mais recorrentes.
- Criar padrao de organizacao para paginas grandes:
  - `page.tsx`
  - `components/`
  - `hooks/`
  - `queries/`
  - `types.ts`

### Arquivos prioritarios

- `src/pages/Settings.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/AIInsights.tsx`
- `src/pages/AgentDetail.tsx`

### Criterio de pronto

- pelo menos 2 paginas grandes ja quebradas em modulos menores;
- padrao de modularizacao definido e replicavel;
- mais previsibilidade para evoluir UI sem mexer em arquivos de 1000+ linhas.

## Semana 3

### Meta

Melhorar consistencia do backend de functions e criar trilho de qualidade automatizada.

### Entregas

- Extrair helpers compartilhados para `supabase/functions/_shared/`:
  - auth/bearer token;
  - parse de body;
  - validacao de periodo;
  - validacao de `agent/company`;
  - normalizacao de telefone;
  - filtros de numeros bloqueados.
- Refatorar as functions mais repetitivas para usar a camada compartilhada.
- Adicionar testes minimos:
  - utilitarios;
  - validadores;
  - formatadores;
  - regras de transformacao isoladas.
- Adicionar pipeline de CI com:
  - install;
  - lint;
  - build frontend;
  - build scanner;
  - testes minimos.

### Arquivos prioritarios

- `supabase/functions/run-ai-analysis/index.ts`
- `supabase/functions/run-revenue-copilot/index.ts`
- `supabase/functions/run-product-intelligence/index.ts`
- `supabase/functions/run-seller-audit/index.ts`
- `supabase/functions/generate-roi-report/index.ts`
- `supabase/functions/ask-manager-copilot/index.ts`

### Criterio de pronto

- duplicacao reduzida nas Edge Functions;
- pipeline automatizada rodando pelo menos lint + builds;
- primeira camada de testes protegendo utilitarios criticos.

## Semana 4

### Meta

Fechar o ciclo com melhor onboarding, melhor performance inicial e uma lista clara do proximo passo.

### Entregas

- Reescrever `README.md` com foco no produto real:
  - o que e;
  - arquitetura;
  - setup local;
  - variaveis de ambiente;
  - como subir frontend, scanner e Supabase;
  - troubleshooting.
- Corrigir referencias quebradas em `docs`.
- Implementar lazy loading por rota nas telas mais pesadas.
- Medir novamente build e bundle apos code-splitting inicial.
- Registrar backlog do proximo ciclo com base no que sobrar aberto.

### Arquivos prioritarios

- `README.md`
- `src/App.tsx`
- `vite.config.ts`
- `docs/`

### Criterio de pronto

- onboarding tecnico claro;
- bundle principal reduzido;
- plano do ciclo seguinte definido com base em evidencias reais.

## Backlog Ordenado por Impacto

### Bloco A. Fazer agora

- Unificar RBAC.
- Reduzir erros de lint ligados a React.
- Refatorar `Settings`, `Dashboard`, `AIInsights`, `AgentDetail`.
- Extrair camada compartilhada das Edge Functions.
- Atualizar README.

### Bloco B. Fazer em seguida

- Testes de smoke e cobertura minima.
- CI completa.
- Melhor observabilidade do `scanner`.
- Code-splitting mais agressivo.

### Bloco C. Proximo ciclo

- Healthcheck e metricas do `scanner`.
- Logs estruturados por job.
- Melhorias de performance mais profundas.
- Revisao de UX dos modulos de inteligencia.

## Metricas de Sucesso do Ciclo

- `lint`:
  - sair de `77 errors / 9 warnings` para `0 errors` ou o mais perto disso com backlog pequeno e controlado.
- Arquitetura:
  - pelo menos 2 a 4 arquivos gigantes reduzidos e modularizados.
- Qualidade:
  - CI ativa no repositorio.
- Documentacao:
  - README refeito e sem links quebrados.
- Performance:
  - reducao perceptivel no tamanho do chunk principal.

## Riscos do Plano

- Tentar corrigir tudo no mesmo PR e travar o time.
- Comecar por performance antes de resolver confiabilidade.
- Refatorar paginas gigantes sem testes minimos de apoio.
- Manter ambiguidade de papeis enquanto novas features continuam entrando.

## Recomendacao de Execucao

- Trabalhar em PRs pequenos por eixo:
  - `rbac-alignment`
  - `react-stability`
  - `settings-refactor`
  - `functions-shared-kit`
  - `ci-and-tests`
  - `readme-and-onboarding`
- Medir progresso por semana, nao por intuicao.
- Evitar abrir novas frentes de feature antes de fechar P1 e P2.

## Sequencia Ideal

1. RBAC e confiabilidade de acesso.
2. Erros de Hooks, render e lint.
3. Modularizacao do frontend.
4. Reuso nas Edge Functions.
5. Testes e CI.
6. README e onboarding.
7. Performance inicial.

## Proximo Passo Recomendado

Comecar pela Semana 1 com um pacote unico de estabilizacao:

- documento curto definindo o RBAC oficial;
- ajuste das camadas afetadas;
- primeira limpeza pesada de lint nos arquivos de fundacao.

Esse passo tem o maior retorno porque reduz risco de permissao, previne regressao e facilita todas as outras refatoracoes.
