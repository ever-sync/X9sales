create table if not exists app.conversation_comments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references app.companies(id) on delete cascade,
    conversation_id uuid not null references app.conversations(id) on delete cascade,
    author_id uuid not null references auth.users(id) on delete cascade,
    body text not null check (char_length(trim(body)) > 0),
    created_at timestamptz not null default now()
);

create index if not exists idx_conversation_comments_conversation
    on app.conversation_comments (conversation_id, created_at desc);

alter table app.conversation_comments enable row level security;

drop policy if exists "conversation_comments_select" on app.conversation_comments;
create policy "conversation_comments_select" on app.conversation_comments
    for select using (
        company_id in (select app.get_user_company_ids(auth.uid()))
    );

drop policy if exists "conversation_comments_insert" on app.conversation_comments;
create policy "conversation_comments_insert" on app.conversation_comments
    for insert with check (
        company_id in (select app.get_user_company_ids(auth.uid()))
        and author_id = auth.uid()
    );

grant select, insert on app.conversation_comments to authenticated;
grant all on app.conversation_comments to service_role;
