-- ===========================================================================
-- 0011 — Realtime publication
-- ===========================================================================
-- Only tables the UI genuinely needs to react to are published. Realtime
-- respects RLS on the `authenticated` channel, so a subscriber still only
-- receives rows their policies allow — but publishing a table needlessly costs
-- bandwidth and widens the surface, so the list is kept short on purpose.
--
-- `replica identity full` makes the OLD row available in UPDATE/DELETE
-- payloads, which the client needs to diff a status change.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'applicants', 'deployments', 'activity_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

alter table public.applicants   replica identity full;
alter table public.deployments  replica identity full;
