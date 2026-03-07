-- Sales records for manual sales registration and listing

create table if not exists app.sales_records (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    seller_agent_id uuid references app.agents(id) on delete set null,
    seller_name_snapshot text not null,
    store_name text not null,
    quantity integer not null check (quantity > 0),
    margin_amount numeric(12,2) not null default 0,
    sold_at timestamptz not null default now(),
    notes text,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_sales_records_company_sold_at
    on app.sales_records (company_id, sold_at desc);

create index if not exists idx_sales_records_company_seller
    on app.sales_records (company_id, seller_agent_id, sold_at desc);

create index if not exists idx_sales_records_company_store
    on app.sales_records (company_id, store_name, sold_at desc);

alter table app.sales_records enable row level security;

drop trigger if exists set_updated_at_sales_records on app.sales_records;
create trigger set_updated_at_sales_records
    before update on app.sales_records
    for each row execute function app.set_updated_at();

drop policy if exists "sales_records_select" on app.sales_records;
create policy "sales_records_select" on app.sales_records
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "sales_records_manage" on app.sales_records;
create policy "sales_records_manage" on app.sales_records
    for all using (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    )
    with check (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    );

grant select on app.sales_records to authenticated;
grant insert, update, delete on app.sales_records to authenticated;
grant all on app.sales_records to service_role;
