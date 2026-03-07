-- Runtime support for settings module: billing mirror, invitations and notifications

create table if not exists app.billing_customers (
    company_id uuid primary key references app.companies(id) on delete cascade,
    stripe_customer_id text unique not null,
    created_at timestamptz not null default now()
);

create table if not exists app.billing_subscriptions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    stripe_subscription_id text unique not null,
    plan_code text not null,
    plan_name text not null,
    status text not null,
    billing_cycle text not null,
    amount_cents integer not null,
    currency text not null default 'brl',
    included_seats integer,
    used_seats integer,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_company on app.billing_subscriptions (company_id, updated_at desc);

create table if not exists app.billing_invoices (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    stripe_invoice_id text unique not null,
    stripe_subscription_id text,
    status text not null,
    amount_due_cents integer not null,
    currency text not null default 'brl',
    due_date timestamptz,
    hosted_invoice_url text,
    invoice_pdf text,
    created_at timestamptz not null default now()
);

create index if not exists idx_billing_invoices_company on app.billing_invoices (company_id, created_at desc);

create table if not exists app.company_invites (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    email text not null,
    role text not null check (role in ('owner_admin', 'manager', 'agent', 'qa_reviewer')),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
    token text unique not null,
    invited_by_user_id uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null,
    accepted_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create unique index if not exists uq_company_invites_pending_email
    on app.company_invites (company_id, lower(email))
    where status = 'pending';

create index if not exists idx_company_invites_company on app.company_invites (company_id, created_at desc);

create table if not exists app.notification_jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    job_type text not null check (job_type in ('admin_report', 'agent_morning_ideas', 'agent_follow_up')),
    target_user_id uuid references auth.users(id) on delete cascade,
    target_agent_id uuid references app.agents(id) on delete cascade,
    channel text not null check (channel in ('email', 'whatsapp')),
    scheduled_for timestamptz not null,
    status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
    payload jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index if not exists idx_notification_jobs_company on app.notification_jobs (company_id, created_at desc);
create index if not exists idx_notification_jobs_pending on app.notification_jobs (status, scheduled_for asc);

alter table app.billing_customers enable row level security;
alter table app.billing_subscriptions enable row level security;
alter table app.billing_invoices enable row level security;
alter table app.company_invites enable row level security;
alter table app.notification_jobs enable row level security;

drop policy if exists "billing_customers_select" on app.billing_customers;
create policy "billing_customers_select" on app.billing_customers
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "billing_subscriptions_select" on app.billing_subscriptions;
create policy "billing_subscriptions_select" on app.billing_subscriptions
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "billing_invoices_select" on app.billing_invoices;
create policy "billing_invoices_select" on app.billing_invoices
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "company_invites_select" on app.company_invites;
create policy "company_invites_select" on app.company_invites
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "company_invites_manage" on app.company_invites;
create policy "company_invites_manage" on app.company_invites
    for all using (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    )
    with check (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
    );

drop policy if exists "notification_jobs_select" on app.notification_jobs;
create policy "notification_jobs_select" on app.notification_jobs
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

grant select on app.billing_customers to authenticated;
grant select on app.billing_subscriptions to authenticated;
grant select on app.billing_invoices to authenticated;
grant select on app.company_invites to authenticated;
grant all on app.company_invites to authenticated;
grant select on app.notification_jobs to authenticated;

grant all on app.billing_customers to service_role;
grant all on app.billing_subscriptions to service_role;
grant all on app.billing_invoices to service_role;
grant all on app.company_invites to service_role;
grant all on app.notification_jobs to service_role;
