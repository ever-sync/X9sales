-- Add auto-block capability to company settings

-- We use the jsonb 'settings' column, so we might just add a default value logic or 
-- simply ensure people know it exists. For MVP-V2, let's explicitly add a comment.

comment on column app.companies.settings is 'JSON configuration including sla_first_response_sec and auto_block_on_critical_risk (boolean).';

-- To make it easier for the backend, we can set a default if missing in the app logic, 
-- but here we just document the schema expectation.
