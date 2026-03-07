alter table app.sales_records
    add column if not exists conversation_id uuid references app.conversations(id) on delete set null;

create index if not exists idx_sales_records_company_conversation
    on app.sales_records (company_id, conversation_id, sold_at desc);
