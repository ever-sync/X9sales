-- ============================================================
-- Migration 00047 — Product Signals
-- Per-product, per-conversation signals extracted by the AI
-- using the product_catalog as context for normalization.
-- One conversation can generate multiple rows (one per product).
-- ============================================================

create table if not exists app.product_signals (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references app.companies(id) on delete cascade,
  conversation_id      uuid not null references app.conversations(id) on delete cascade,
  agent_id             uuid references app.agents(id) on delete set null,

  -- Product identification (catalog-normalized)
  product_id           uuid references app.product_catalog(id) on delete set null,
  product_name_normalized text not null,       -- matched to catalog name, or best guess
  product_name_raw     text not null,           -- exactly what the AI found in conversation

  -- Traffic dimension: was this product the reason for contact?
  is_traffic_driver    boolean not null default false,
  mention_source       text check (mention_source in ('cliente_iniciou', 'agente_ofereceu', 'comparacao')),

  -- Offer dimension: did the agent proactively pitch this?
  agent_offered        boolean not null default false,
  offer_timing         text check (offer_timing in ('inicio', 'meio', 'fechamento', null)),
  offer_outcome        text check (offer_outcome in ('aceitou', 'recusou', 'pendente', null)),

  -- Price dimension: price pressure signals
  price_objection      boolean not null default false,
  price_objection_type text check (price_objection_type in ('bloqueante', 'leve', 'nenhuma')),
  price_anchor         text,                    -- price client mentioned or expected

  -- Value dimension: value perception and communication gaps
  value_questions      text[] not null default '{}',  -- questions client asked about value
  value_understood     boolean,                 -- did client seem to understand value?
  value_gap            text,                    -- what value argument was missing
  value_arguments_used text[] not null default '{}',  -- arguments agent used

  -- Outcome
  conversion_signal    text check (conversion_signal in ('converteu', 'perdeu', 'pendente')),
  loss_reason          text check (loss_reason in ('preco', 'valor', 'concorrente', 'timing', 'outro', null)),
  sentiment_score      numeric(4,3) check (sentiment_score between -1.0 and 1.0),

  -- AI narrative
  observation          text,

  -- Metadata
  prompt_version       text not null default 'v1-product-signals',
  analyzed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

-- Indexes
create index if not exists product_signals_company_id_idx
  on app.product_signals (company_id);

create index if not exists product_signals_conversation_id_idx
  on app.product_signals (conversation_id);

create index if not exists product_signals_product_id_idx
  on app.product_signals (product_id);

create index if not exists product_signals_analyzed_at_idx
  on app.product_signals (company_id, analyzed_at desc);

-- RLS
alter table app.product_signals enable row level security;

drop policy if exists "product_signals_select" on app.product_signals;
create policy "product_signals_select" on app.product_signals
  for select using (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );

drop policy if exists "product_signals_insert" on app.product_signals;
create policy "product_signals_insert" on app.product_signals
  for insert with check (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );

drop policy if exists "product_signals_delete" on app.product_signals;
create policy "product_signals_delete" on app.product_signals
  for delete using (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );
