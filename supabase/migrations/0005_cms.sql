-- ============================================================================
-- Atlas Clothier - 0005: CMS tables
-- Adds static pages, social links, homepage features, and extends
-- site_settings with logo/favicon/announcement/SEO columns.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend site_settings singleton
-- ---------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists logo_url              text,
  add column if not exists favicon_url           text,
  add column if not exists announcement_text     text,
  add column if not exists announcement_active   boolean not null default false,
  add column if not exists seo_title             text,
  add column if not exists meta_description      text;

-- ---------------------------------------------------------------------------
-- 2. Static CMS pages (About, Privacy Policy, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.cms_pages (
  id           uuid    primary key default gen_random_uuid(),
  slug         text    unique not null,
  title        text    not null,
  content      text,           -- HTML from Tiptap serialisation
  is_published boolean not null default false,
  updated_at   timestamptz not null default now()
);

drop trigger if exists cms_pages_set_updated_at on public.cms_pages;
create trigger cms_pages_set_updated_at
  before update on public.cms_pages
  for each row execute function public.set_updated_at();

-- Seed the five standard pages (do nothing if slugs already exist).
insert into public.cms_pages (slug, title, content, is_published)
values
  ('about-us',        'About Us',                '<p>Tell your story here.</p>', false),
  ('privacy-policy',  'Privacy Policy',          '<p>Your privacy policy content.</p>', false),
  ('shipping-policy', 'Shipping Policy',         '<p>Your shipping policy content.</p>', false),
  ('returns',         'Return & Refund Policy',  '<p>Your returns policy content.</p>', false),
  ('terms',           'Terms & Conditions',      '<p>Your terms and conditions.</p>', false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Social media links
-- ---------------------------------------------------------------------------
create table if not exists public.social_links (
  id         uuid    primary key default gen_random_uuid(),
  platform   text    not null,  -- instagram | facebook | tiktok | youtube | pinterest
  url        text    not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. Homepage features section
-- ---------------------------------------------------------------------------
create table if not exists public.cms_features (
  id          uuid    primary key default gen_random_uuid(),
  icon        text,             -- emoji or icon name
  heading     text    not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

-- Seed example features (only if the table is empty).
insert into public.cms_features (icon, heading, description, is_active, sort_order)
select * from (values
  ('🚚', 'Free Delivery',   'Free delivery on orders above a set amount.',     true, 1),
  ('↩️', 'Easy Returns',   'Hassle-free returns within 7 days.',              true, 2),
  ('🔒', 'Secure Payments', 'Cash on delivery — no card details required.',    true, 3)
) as v(icon, heading, description, is_active, sort_order)
where not exists (select 1 from public.cms_features);

-- ---------------------------------------------------------------------------
-- 5. CMS content storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cms-assets', 'cms-assets', true)
on conflict (id) do nothing;

drop policy if exists "public read cms-assets" on storage.objects;
create policy "public read cms-assets" on storage.objects
  for select to anon, authenticated using (bucket_id = 'cms-assets');

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cms_pages    enable row level security;
alter table public.social_links enable row level security;
alter table public.cms_features enable row level security;

-- cms_pages: public read of published pages only.
drop policy if exists "public read published pages" on public.cms_pages;
create policy "public read published pages" on public.cms_pages
  for select to anon, authenticated using (is_published = true);

-- social_links: public read of active links.
drop policy if exists "public read social links" on public.social_links;
create policy "public read social links" on public.social_links
  for select to anon, authenticated using (is_active = true);

-- cms_features: public read of active features.
drop policy if exists "public read cms features" on public.cms_features;
create policy "public read cms features" on public.cms_features
  for select to anon, authenticated using (is_active = true);

-- All writes to CMS tables are performed via the service-role key
-- (admin server actions), which bypasses RLS. No write policies needed.
