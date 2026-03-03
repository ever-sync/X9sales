-- Migration 00019: RPC for fetching the current user's companies + roles
-- Uses SECURITY DEFINER to bypass RLS and avoid circular policy evaluation.

CREATE OR REPLACE FUNCTION app.get_my_companies()
RETURNS TABLE (
  company_id   uuid,
  role         text,
  company_name text,
  slug         text,
  settings     jsonb,
  created_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app, public
AS $$
  SELECT
    cm.company_id,
    cm.role,
    c.name       AS company_name,
    c.slug,
    c.settings,
    c.created_at
  FROM app.company_members cm
  JOIN app.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION app.get_my_companies() TO authenticated;
