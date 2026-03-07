-- Consolidate workspace roles to only owner_admin (ADMIN) and agent (VISUALIZADOR)

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
