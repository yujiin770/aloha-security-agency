-- ===========================================================================
-- 0010 — Supabase Storage: buckets and object policies
-- ===========================================================================
-- Every bucket holding personal data is PRIVATE. Files are never linked to
-- directly; the app mints short-lived signed URLs on demand
-- (createSignedUrl, 60s TTL) so a leaked URL expires almost immediately.
--
-- Object key convention:  {applicant_id|personnel_id}/{document_type}-{uuid}.{ext}
-- The leading folder is the owning record's UUID, which is what the policies
-- below key on via storage.foldername(name)[1].
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resumes', 'resumes', false, 10485760,
   array['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('government-ids', 'government-ids', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('certificates', 'certificates', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('personnel-images', 'personnel-images', false, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('reports', 'reports', false, 26214400,
   array['application/pdf','text/csv',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  -- The only public bucket: logo, brand assets, public site imagery.
  ('company-assets', 'company-assets', true, 10485760,
   array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Applicant-facing buckets: resumes, government-ids, certificates
-- ---------------------------------------------------------------------------
-- Anonymous applicants must be able to upload during the application flow, but
-- must never be able to read, overwrite, or list anything. Upload-only is the
-- whole grant: INSERT with no matching SELECT policy.
do $$
declare
  b text;
begin
  foreach b in array array['resumes', 'government-ids', 'certificates']
  loop
    execute format(
      $p$drop policy if exists %I on storage.objects$p$,
      b || '_insert_anon'
    );
    execute format(
      $p$create policy %I on storage.objects
         for insert to anon, authenticated
         with check (
           bucket_id = %L
           -- Must be filed under a real, still-pending application.
           and exists (
             select 1 from public.applicants a
             where a.id::text = (storage.foldername(name))[1]
               and (a.status = 'pending' or public.is_staff())
           )
         )$p$,
      b || '_insert_anon', b
    );

    execute format($p$drop policy if exists %I on storage.objects$p$, b || '_select_staff');
    execute format(
      $p$create policy %I on storage.objects
         for select to authenticated
         using (
           bucket_id = %L
           and public.has_role(
             'owner'::public.app_role, 'admin'::public.app_role,
             'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
             'deployment_officer'::public.app_role
           )
         )$p$,
      b || '_select_staff', b
    );

    execute format($p$drop policy if exists %I on storage.objects$p$, b || '_delete_staff');
    execute format(
      $p$create policy %I on storage.objects
         for delete to authenticated
         using (
           bucket_id = %L
           and public.has_role(
             'owner'::public.app_role, 'admin'::public.app_role,
             'hr_staff'::public.app_role
           )
         )$p$,
      b || '_delete_staff', b
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- personnel-images
-- ---------------------------------------------------------------------------
drop policy if exists personnel_images_select on storage.objects;
create policy personnel_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'personnel-images' and public.is_staff());

drop policy if exists personnel_images_write on storage.objects;
create policy personnel_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'personnel-images'
    and public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                        'hr_staff'::public.app_role)
  );

drop policy if exists personnel_images_update on storage.objects;
create policy personnel_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'personnel-images'
    and public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                        'hr_staff'::public.app_role)
  );

drop policy if exists personnel_images_delete on storage.objects;
create policy personnel_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'personnel-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- reports — generated exports, admin-facing
-- ---------------------------------------------------------------------------
drop policy if exists reports_select on storage.objects;
create policy reports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and public.is_staff());

drop policy if exists reports_write on storage.objects;
create policy reports_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and public.is_staff());

drop policy if exists reports_delete on storage.objects;
create policy reports_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and public.is_admin());

-- ---------------------------------------------------------------------------
-- company-assets — public read, admin write
-- ---------------------------------------------------------------------------
drop policy if exists company_assets_select on storage.objects;
create policy company_assets_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'company-assets');

drop policy if exists company_assets_write on storage.objects;
create policy company_assets_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-assets' and public.is_admin());

drop policy if exists company_assets_update on storage.objects;
create policy company_assets_update on storage.objects
  for update to authenticated
  using (bucket_id = 'company-assets' and public.is_admin());

drop policy if exists company_assets_delete on storage.objects;
create policy company_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-assets' and public.is_admin());
