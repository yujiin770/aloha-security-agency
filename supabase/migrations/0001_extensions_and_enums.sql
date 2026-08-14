-- ===========================================================================
-- 0001 — Extensions, schema conventions and enumerated types
-- Aloha Security Agency — Recruitment & Deployment Management System
-- ===========================================================================
-- All objects live in `public` unless noted. Every function in this project is
-- declared with an explicit `SET search_path` to prevent search-path hijacking
-- (OWASP A03 — injection).
-- ===========================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- --------------------------------------------------------------------------
-- Enumerated types
-- --------------------------------------------------------------------------
-- Enums are wrapped in DO blocks so migrations stay re-runnable during
-- development. Adding a value later requires `alter type ... add value`.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'owner',
      'admin',
      'hr_staff',
      'recruitment_officer',
      'deployment_officer',
      'branch_coordinator'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'applicant_status') then
    create type public.applicant_status as enum (
      'pending',
      'screening',
      'interview',
      'hired',
      'rejected',
      'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'position_type') then
    create type public.position_type as enum (
      'security_guard',
      'lady_guard',
      'vip_escort',
      'cctv_operator',
      'driver'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'employment_status') then
    create type public.employment_status as enum (
      'active',
      'on_leave',
      'suspended',
      'resigned',
      'terminated'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'deployment_status') then
    create type public.deployment_status as enum (
      'pending',
      'active',
      'ended',
      'transferred',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'shift_type') then
    create type public.shift_type as enum (
      'day',
      'night',
      'mid',
      'rotating'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum (
      'resume',
      'government_id',
      'nbi_clearance',
      'police_clearance',
      'barangay_clearance',
      'medical_certificate',
      'training_certificate',
      'security_license',
      'diploma',
      'photo',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'applicant_submitted',
      'applicant_status_changed',
      'interview_scheduled',
      'deployment_assigned',
      'deployment_ended',
      'document_uploaded',
      'system'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'civil_status') then
    create type public.civil_status as enum (
      'single',
      'married',
      'widowed',
      'separated',
      'divorced'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'sex_type') then
    create type public.sex_type as enum ('male', 'female');
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type public.audit_action as enum ('insert', 'update', 'delete');
  end if;
end
$$;

comment on type public.app_role is
  'Internal staff roles. Drives every RLS policy in this database.';
comment on type public.applicant_status is
  'Recruitment pipeline: pending -> screening -> interview -> hired | rejected -> archived.';
