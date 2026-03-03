-- Migration: Create register_company RPC
-- This function allows a user to register a company and automatically become its owner_admin.

CREATE OR REPLACE FUNCTION app.register_company(
    p_name text,
    p_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_company_id uuid;
    v_user_id uuid;
BEGIN
    -- 1. Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Insert the company
    INSERT INTO app.companies (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_company_id;

    -- 3. Link the user as owner_admin
    INSERT INTO app.company_members (company_id, user_id, role)
    VALUES (v_company_id, v_user_id, 'owner_admin');

    -- 4. Initialize watermarks for the scanner
    INSERT INTO app.processing_watermarks (company_id, source_table, last_processed_at)
    VALUES 
        (v_company_id, 'raw.messages', now()),
        (v_company_id, 'raw.calls',    now()),
        (v_company_id, 'raw.deals',    now());

    RETURN v_company_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Empresa com este slug/identificador já existe.';
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION app.register_company(text, text) TO authenticated;
