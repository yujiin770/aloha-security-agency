-- ===========================================================================
-- 0016 — Website content management
-- ===========================================================================
-- Until now the marketing site's testimonials, client list, accreditations and
-- news lived in TypeScript, and its photography lived in `public/images/`.
-- That makes every copy change a developer task and a deploy, which is not a
-- content management system — it is a hostage situation.
--
-- These tables move that content into the database, editable by an
-- administrator through /admin/content.
--
-- Read model: anonymous visitors may SELECT only rows flagged published. The
-- publish flag is therefore a real access boundary, not a UI filter — an
-- unpublished draft is invisible to the public site even if someone crafts a
-- request by hand.
--
-- Images live in the existing public `company-assets` bucket, so the marketing
-- site renders them directly without minting signed URLs on every page load.
-- Nothing sensitive goes in there — it is brand photography.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Testimonials
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  quote         text not null,
  author_name   text not null,
  author_role   text,
  company       text,
  avatar_path   text,
  rating        smallint,
  sort_order    smallint not null default 0,
  is_published  boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint testimonials_quote_length_chk
    check (char_length(btrim(quote)) between 10 and 1000),
  constraint testimonials_author_chk
    check (char_length(btrim(author_name)) > 0),
  constraint testimonials_rating_chk
    check (rating is null or rating between 1 and 5)
);

create index if not exists testimonials_published_idx
  on public.testimonials (is_published, sort_order);

comment on table public.testimonials is
  'Client testimonials shown on the public site. Publish only quotes given with permission.';

-- ---------------------------------------------------------------------------
-- 2. Clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  logo_path     text,
  website_url   text,
  industry      text,
  sort_order    smallint not null default 0,
  is_published  boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint clients_name_chk check (char_length(btrim(name)) > 0),
  constraint clients_url_chk
    check (website_url is null or website_url ~* '^https?://')
);

create index if not exists clients_published_idx
  on public.clients (is_published, sort_order);

comment on table public.clients is
  'Client logos for the trust strip. Publish only with the client''s permission to be named.';

-- ---------------------------------------------------------------------------
-- 3. Accreditations
-- ---------------------------------------------------------------------------
create table if not exists public.accreditations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  issuer        text,
  reference_no  text,
  valid_until   date,
  logo_path     text,
  description   text,
  sort_order    smallint not null default 0,
  is_published  boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint accreditations_name_chk check (char_length(btrim(name)) > 0)
);

create index if not exists accreditations_published_idx
  on public.accreditations (is_published, sort_order);

comment on table public.accreditations is
  'Licences, registrations and memberships. Publish only credentials actually held.';

-- ---------------------------------------------------------------------------
-- 4. News posts
-- ---------------------------------------------------------------------------
create table if not exists public.news_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  title         text not null,
  excerpt       text,
  body          text,
  cover_path    text,
  category      text,
  published_at  timestamptz,
  is_published  boolean not null default false,

  author_id     uuid references public.profiles (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint news_posts_slug_unique unique (slug),
  constraint news_posts_slug_shape_chk check (slug ~ '^[a-z0-9-]{3,120}$'),
  constraint news_posts_title_chk check (char_length(btrim(title)) > 0),
  -- A published post must carry a date; the public list orders by it.
  constraint news_posts_published_date_chk
    check (not is_published or published_at is not null)
);

create index if not exists news_posts_published_idx
  on public.news_posts (is_published, published_at desc);
create index if not exists news_posts_slug_idx on public.news_posts (slug);

comment on table public.news_posts is
  'Announcements and company updates for the public site.';

-- ---------------------------------------------------------------------------
-- 5. Site media — keyed image slots
-- ---------------------------------------------------------------------------
-- The marketing site has a fixed set of image positions (hero, about, team…).
-- Rather than a free-form media library nobody maintains, each slot is a named
-- key an administrator fills. The public site asks for a key and gets whatever
-- is currently in it.
create table if not exists public.site_media (
  key           text primary key,
  label         text not null,
  description   text,
  bucket_id     text not null default 'company-assets',
  storage_path  text,
  alt_text      text,
  width         integer,
  height        integer,
  sort_order    smallint not null default 0,

  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint site_media_key_shape_chk check (key ~ '^[a-z0-9_]{2,60}$')
);

comment on table public.site_media is
  'Named image slots for the marketing site. An empty storage_path falls back to the bundled placeholder.';

-- ---------------------------------------------------------------------------
-- 6. Housekeeping triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'testimonials', 'clients', 'accreditations', 'news_posts', 'site_media'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
    execute format('drop trigger if exists audit_changes on public.%I', t);
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.testimonials   enable row level security;
alter table public.clients        enable row level security;
alter table public.accreditations enable row level security;
alter table public.news_posts     enable row level security;
alter table public.site_media     enable row level security;

-- Anonymous visitors: published rows only. This is what makes "unpublished"
-- mean something — a draft testimonial is not merely hidden by the UI, it is
-- unreadable without a staff session.
do $$
declare
  t text;
begin
  foreach t in array array['testimonials', 'clients', 'accreditations', 'news_posts']
  loop
    execute format($p$drop policy if exists %I on public.%I$p$, t || '_select_public', t);
    execute format(
      $p$create policy %I on public.%I
         for select to anon, authenticated
         using (is_published or public.is_staff())$p$,
      t || '_select_public', t
    );

    execute format($p$drop policy if exists %I on public.%I$p$, t || '_write_admin', t);
    execute format(
      $p$create policy %I on public.%I
         for all to authenticated
         using (public.is_admin()) with check (public.is_admin())$p$,
      t || '_write_admin', t
    );
  end loop;
end
$$;

-- Site media carries no secrets — it is the brand photography the public site
-- renders — so it is readable by everyone and writable by administrators.
drop policy if exists site_media_select_public on public.site_media;
create policy site_media_select_public on public.site_media
  for select to anon, authenticated using (true);

drop policy if exists site_media_write_admin on public.site_media;
create policy site_media_write_admin on public.site_media
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete
  on public.testimonials, public.clients, public.accreditations,
     public.news_posts, public.site_media
  to authenticated;

grant select
  on public.testimonials, public.clients, public.accreditations,
     public.news_posts, public.site_media
  to anon;

-- ---------------------------------------------------------------------------
-- 9. Seed the media slots
-- ---------------------------------------------------------------------------
-- Rows with a null storage_path: the slot exists in the admin UI ready to be
-- filled, and the public site falls back to its bundled placeholder until it is.
insert into public.site_media (key, label, description, width, height, sort_order) values
  ('hero', 'Landing hero background',
   'Officers on post or an operations floor. Keep the left third uncluttered — the headline sits there.',
   1920, 1080, 10),
  ('about', 'About / who we are',
   'Team or office. Faces welcome, professional and unposed.', 1200, 900, 20),
  ('team', 'About page portrait',
   'Personnel at a client site. Vertical crop.', 900, 1200, 30),
  ('training', 'Training session',
   'Pre-deployment or refresher training in progress.', 1200, 800, 40),
  ('service_guarding', 'Service — manned guarding',
   'Uniformed officer at a static post.', 800, 600, 50),
  ('service_cctv', 'Service — CCTV monitoring',
   'Command centre with monitors visible.', 800, 600, 60),
  ('service_escort', 'Service — VIP escort',
   'Close-in protection detail.', 800, 600, 70),
  ('cta_bg', 'Closing call-to-action background',
   'Wide, low-detail and dark-friendly — it sits under a heavy ink overlay.',
   1920, 800, 80)
on conflict (key) do nothing;
