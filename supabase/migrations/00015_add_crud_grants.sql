-- Migration 00015: Grant CRUD permissions to authenticated users
-- (RLS still filters what each user can do)

GRANT ALL ON ALL TABLES IN SCHEMA app TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA app TO authenticated;

-- Ensure scanner/worker still has access
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO service_role;
GRANT USAGE ON SCHEMA app TO authenticated, service_role;
