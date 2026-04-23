# RBAC Oficial

Data: 2026-04-21
Status: Aprovado como contrato atual do produto

## Decisao

O modelo oficial de papeis do produto passa a ser:

- `owner_admin`
- `agent`

Nao fazem parte do contrato atual:

- `manager`
- `qa_reviewer`

Esses papeis devem ser tratados como legado e removidos das camadas que ainda os referenciam.

## Objetivo do modelo atual

Manter um RBAC simples, previsivel e consistente com o estado real do produto hoje:

- `owner_admin`: acesso total ao workspace/empresa
- `agent`: acesso restrito ao proprio escopo operacional

## Contrato funcional

## `owner_admin`

Pode:

- acessar todos os modulos do sistema;
- gerenciar configuracoes da empresa;
- gerenciar usuarios;
- disparar rotinas analiticas e operacionais;
- visualizar dados consolidados da empresa;
- administrar billing, integracoes e configuracoes globais.

## `agent`

Pode:

- acessar o proprio painel;
- visualizar apenas o proprio escopo quando aplicavel;
- operar fluxos individuais de atendimento e vendas conforme permissao do frontend e RLS;
- consumir recursos voltados ao proprio desempenho.

Nao deve:

- administrar empresa;
- gerenciar usuarios;
- acessar configuracoes globais;
- operar funcionalidades administrativas exclusivas do `owner_admin`.

## Fonte de verdade desejada

As seguintes camadas devem refletir exatamente esse contrato:

- tipos TS;
- constantes de permissao;
- hooks de permissao;
- Edge Functions;
- migrations e helpers SQL;
- politicas de RLS;
- convites e atualizacao de membros.

## Evidencias que sustentam esta decisao

Os seguintes pontos do projeto ja refletem o modelo simplificado:

- `src/types/index.ts`
- `src/config/constants.ts`
- `src/hooks/usePermissions.ts`
- `supabase/migrations/00028_consolidate_workspace_roles.sql`
- `supabase/functions/update-company-member-role/index.ts`

Todos eles trabalham com `owner_admin` e `agent`.

## Pontos ainda divergentes no repositorio

Os seguintes trechos ainda usam modelo legado e devem ser alinhados:

- `supabase/migrations/00004_rls_policies.sql`
- `supabase/functions/ask-manager-copilot/index.ts`
- qualquer helper SQL que ainda trate `manager` e `qa_reviewer` como papeis ativos

## Regra de compatibilidade

Enquanto houver dados ou codigo legado:

- `manager` e `qa_reviewer` nao devem ser introduzidos em novas features;
- referencias existentes devem ser consideradas debito tecnico de migracao;
- qualquer camada nova deve usar apenas `owner_admin` e `agent`.

## Regra para desenvolvimento futuro

Se o produto voltar a suportar papeis intermediarios no futuro, isso deve acontecer apenas com:

- novo documento de contrato;
- revisao de frontend, banco e functions em conjunto;
- migracao explicita de dados e RLS;
- atualizacao coordenada de tipos, permissoes e testes.

Sem isso, o contrato vigente permanece:

- `owner_admin`
- `agent`

## Proximas tarefas derivadas

- alinhar frontend ao contrato oficial;
- alinhar banco e Edge Functions ao contrato oficial;
- revisar RLS e helpers SQL para remover papeis legados;
- adicionar testes para garantir que apenas os papeis oficiais sejam aceitos nas camadas criticas.
