create table if not exists app.stores (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_stores_company_name
    on app.stores (company_id, lower(name));

create index if not exists idx_stores_company
    on app.stores (company_id, name)
    where is_active = true;

alter table app.agents
    add column if not exists store_id uuid references app.stores(id) on delete set null;

create index if not exists idx_agents_store
    on app.agents (company_id, store_id)
    where is_active = true;

alter table app.stores enable row level security;

drop trigger if exists set_updated_at_stores on app.stores;
create trigger set_updated_at_stores
    before update on app.stores
    for each row execute function app.set_updated_at();

drop policy if exists "stores_select" on app.stores;
create policy "stores_select" on app.stores
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "stores_manage" on app.stores;
create policy "stores_manage" on app.stores
    for all using (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    )
    with check (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    );

grant select on app.stores to authenticated;
grant insert, update, delete on app.stores to authenticated;
grant all on app.stores to service_role;
