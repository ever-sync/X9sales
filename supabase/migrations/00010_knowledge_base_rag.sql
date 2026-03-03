-- Enable the pgvector extension to work with embedding vectors
-- (Extensions usually stay in public or their own schema, leaving 'ids exists' as is)
create extension if not exists vector;

-- Create the knowledge base table
create table app.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references app.companies(id) on delete cascade not null,
  title text not null,
  content text not null,
  embedding vector(1536), -- 1536 is the dimension for openai text-embedding-ada-002 / text-embedding-3-small
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Protect with RLS
alter table app.knowledge_base enable row level security;

create policy "Users can view their company knowledge base"
  on app.knowledge_base for select
  using (
    auth.uid() in (
      select user_id from app.company_members where company_id = knowledge_base.company_id
    )
  );

create policy "Managers can insert into knowledge base"
  on app.knowledge_base for insert
  with check (
    auth.uid() in (
      select user_id from app.company_members 
      where company_id = knowledge_base.company_id 
      and role in ('owner_admin', 'manager')
    )
  );

-- Create a function to search for documents similar to a query embedding
create or replace function app.match_knowledge_base (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_company_id uuid
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    knowledge_base.id,
    knowledge_base.title,
    knowledge_base.content,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from app.knowledge_base
  where knowledge_base.company_id = p_company_id
  and 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
