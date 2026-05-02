-- ============================================================
-- Migration 00046 — Product Catalog
-- Stores the product catalog used by the AI to normalize
-- product mentions found in conversations.
-- ============================================================

create table if not exists app.product_catalog (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references app.companies(id) on delete cascade,
  name              text not null,
  price             numeric(12, 2) default null,
  category          text default null,
  aliases           text[] not null default '{}',
  key_differentials text[] not null default '{}',
  common_objections text[] not null default '{}',
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- index for fast lookups per company
create index if not exists product_catalog_company_id_idx
  on app.product_catalog (company_id);

-- auto-update updated_at
create or replace function app.set_product_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_catalog_updated_at on app.product_catalog;
create trigger product_catalog_updated_at
  before update on app.product_catalog
  for each row execute function app.set_product_catalog_updated_at();

-- RLS: each company can only see and manage its own products
alter table app.product_catalog enable row level security;

drop policy if exists "product_catalog_select" on app.product_catalog;
create policy "product_catalog_select" on app.product_catalog
  for select using (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );

drop policy if exists "product_catalog_insert" on app.product_catalog;
create policy "product_catalog_insert" on app.product_catalog
  for insert with check (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );

drop policy if exists "product_catalog_update" on app.product_catalog;
create policy "product_catalog_update" on app.product_catalog
  for update using (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );

drop policy if exists "product_catalog_delete" on app.product_catalog;
create policy "product_catalog_delete" on app.product_catalog
  for delete using (
    company_id in (select app.get_user_company_ids(auth.uid()))
  );
