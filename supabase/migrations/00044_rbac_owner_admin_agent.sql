-- Consolidate RBAC to the official contract:
-- owner_admin = admin scope
-- agent = restricted scope

-- Defensive backfill in case legacy roles still exist in any environment.
update app.company_members
set role = 'agent'
where role in ('manager', 'qa_reviewer');

update app.company_invites
set role = 'agent'
where role in ('manager', 'qa_reviewer');

do $$
declare
    v_constraint_name text;
begin
    select conname
      into v_constraint_name
      from pg_constraint
     where conrelid = 'app.company_members'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%role IN (%';

    if v_constraint_name is not null then
        execute format('alter table app.company_members drop constraint %I', v_constraint_name);
    end if;
end $$;

alter table app.company_members
    drop constraint if exists chk_company_members_role_v2;

alter table app.company_members
    add constraint chk_company_members_role_v2
    check (role in ('owner_admin', 'agent'));

do $$
declare
    v_constraint_name text;
begin
    select conname
      into v_constraint_name
      from pg_constraint
     where conrelid = 'app.company_invites'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%role IN (%';

    if v_constraint_name is not null then
        execute format('alter table app.company_invites drop constraint %I', v_constraint_name);
    end if;
end $$;

alter table app.company_invites
    drop constraint if exists chk_company_invites_role_v2;

alter table app.company_invites
    add constraint chk_company_invites_role_v2
    check (role in ('owner_admin', 'agent'));

-- Legacy role thresholds now map to the current contract:
-- owner_admin -> admin-level access
-- manager / qa_reviewer -> owner_admin threshold (admin-only)
-- agent -> agent threshold
create or replace function app.has_role_level(p_user_id uuid, p_company_id uuid, p_min_role text)
returns boolean
language plpgsql
security definer
stable
set search_path = app
as $$
declare
    v_role text;
    v_current_level int;
    v_required_level int;
begin
    select role
      into v_role
      from app.company_members
     where user_id = p_user_id
       and company_id = p_company_id
       and is_active = true;

    if v_role is null then
        return false;
    end if;

    v_current_level := case v_role
        when 'owner_admin' then 90
        when 'agent' then 30
        when 'manager' then 30
        when 'qa_reviewer' then 30
        else null
    end;

    v_required_level := case p_min_role
        when 'owner_admin' then 90
        when 'manager' then 90
        when 'qa_reviewer' then 90
        when 'agent' then 30
        else null
    end;

    if v_current_level is null or v_required_level is null then
        return false;
    end if;

    return v_current_level >= v_required_level;
end;
$$;

-- Teams remain in the schema, but the current RBAC contract no longer exposes
-- a manager role. Keep helper callable and deterministic.
create or replace function app.get_managed_agent_ids(p_user_id uuid, p_company_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = app
as $$
    select null::uuid
    where false;
$$;
