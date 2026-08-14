-- ===========================================================================
-- 0012 — System Administrator role
-- ===========================================================================
-- This migration does ONE thing: add the enum value.
--
-- PostgreSQL will not let a newly added enum value be *used* in the same
-- transaction that adds it. Since the Supabase CLI runs each migration file in
-- its own transaction, the role has to be introduced here and can only be
-- referenced from 0013 onwards. Merging the two would fail with
-- "unsafe use of new value of enum type".
--
-- Scope of the role (enforced in 0013):
--   Full read/write on configuration and reference data — positions, ranks,
--   branches, settings, roles, permissions.
--   Read-only on operational data — applicants, personnel, deployments, audit.
--   No ability to grant roles; that stays with owner and admin.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role'
      and e.enumlabel = 'system_administrator'
  ) then
    alter type public.app_role add value 'system_administrator';
  end if;
end
$$;
