-- ===========================================================================
-- 0006 — System tables: audit, activity, notifications, settings, email log
-- ===========================================================================

-- --------------------------------------------------------------------------
-- audit_logs — machine-generated row diffs from the generic audit trigger
-- --------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  table_name    text not null,
  record_id     uuid,
  action        public.audit_action not null,
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_email   text,
  old_data      jsonb,
  new_data      jsonb,
  changed_keys  text[],
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_table_record_idx
  on public.audit_logs (table_name, record_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

comment on table public.audit_logs is
  'Immutable row-change log. No UPDATE or DELETE policy exists for any role.';

-- --------------------------------------------------------------------------
-- activity_logs — human-meaningful events written by the application
-- --------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,             -- e.g. 'applicant.hired'
  entity_type text,
  entity_id   uuid,
  summary     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- --------------------------------------------------------------------------
-- notifications — per-user, delivered live over Supabase Realtime
-- --------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null default 'system',
  title       text not null,
  body        text,
  link        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Partial index: the bell badge only ever counts unread rows.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- settings — singleton key/value configuration
-- --------------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  description text not null default '',
  is_public   boolean not null default false,  -- readable by anon on the public site
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.settings.is_public is
  'When true the row is readable by the anonymous role — used for public site content only. Never flag secrets.';

-- --------------------------------------------------------------------------
-- email_logs — outbound mail written by the send-notification-email function
-- --------------------------------------------------------------------------
create table if not exists public.email_logs (
  id            uuid primary key default gen_random_uuid(),
  to_email      text not null,
  subject       text not null,
  template      text,
  status        text not null default 'queued',
  provider_id   text,
  error_message text,
  entity_type   text,
  entity_id     uuid,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint email_logs_status_chk check (status in ('queued', 'sent', 'failed', 'bounced'))
);

create index if not exists email_logs_status_idx on public.email_logs (status, created_at desc);
create index if not exists email_logs_entity_idx on public.email_logs (entity_type, entity_id);
