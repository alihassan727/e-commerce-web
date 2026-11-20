-- ============================================================================
-- Atlas Clothier — initial schema, RLS, triggers, storage, and seed data
-- Run this in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ---------- Enums -----------------------------------------------------------
do $$ begin
  create type public.order_status as enum (
    'pending', 'confirmed', 'out_of_stock', 'shipped', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.homepage_section_type as enum ('hero', 'category', 'featured');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete set null,
  title        text not null,
  slug         text not null unique,
  description  text,
  price        numeric(10,2) not null default 0,
  has_variants boolean not null default false,
  stock        integer,                          -- null when has_variants = true
  is_featured  boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0
);

create table if not exists public.variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  size        text,
  color       text,
  stock       integer not null default 0,
  sku         text
);

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique references auth.users(id) on delete set null,
  email       text not null,
  name        text,
  phone       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid references public.customers(id) on delete set null,
  status                 public.order_status not null default 'pending',
  customer_name          text not null,
  email                  text not null,
  phone                  text not null,
  alternate_phone        text,
  address                text not null,
  city                   text not null,
  delivery_instructions  text,
  preferred_delivery_time text,
  subtotal               numeric(10,2) not null default 0,
  delivery_fee           numeric(10,2) not null default 0,
  total                  numeric(10,2) not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  product_id           uuid references public.products(id) on delete set null,
  variant_id           uuid references public.variants(id) on delete set null,
  title_snapshot       text not null,
  variant_label_snapshot text,
  price                numeric(10,2) not null default 0,
  quantity             integer not null default 1,
  line_total           numeric(10,2) not null default 0
);

create table if not exists public.homepage_sections (
  id           uuid primary key default gen_random_uuid(),
  type         public.homepage_section_type not null,
  category_id  uuid references public.categories(id) on delete set null,
  title        text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  config       jsonb not null default '{}'::jsonb
);

create table if not exists public.order_audit (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade,
  event       text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.site_settings (
  id                    integer primary key default 1 check (id = 1),
  store_name            text not null default 'Atlas Clothier',
  contact_email         text,
  contact_phone         text,
  currency              text not null default 'PKR',
  delivery_fee          numeric(10,2) not null default 0,
  delivery_areas        text[] not null default '{}',
  low_stock_threshold   integer not null default 5,
  cod_notes              text,
  updated_at            timestamptz not null default now()
);

-- ---------- Indexes ---------------------------------------------------------
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_active on public.products(is_active);
create index if not exists idx_product_images_product on public.product_images(product_id);
create index if not exists idx_variants_product on public.variants(product_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_customers_auth_uid on public.customers(auth_uid);
create index if not exists idx_homepage_active on public.homepage_sections(is_active, sort_order);

-- ---------- Triggers --------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Auto-create a customers row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.customers (auth_uid, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (auth_uid) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ---------------------------------------------
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.product_images    enable row level security;
alter table public.variants          enable row level security;
alter table public.customers         enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.order_audit      enable row level security;
alter table public.site_settings    enable row level security;

-- Public reads of catalog data (anon + authenticated).
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories
  for select to anon, authenticated using (is_active = true);

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
  for select to anon, authenticated using (is_active = true);

drop policy if exists "public read product_images" on public.product_images;
create policy "public read product_images" on public.product_images
  for select to anon, authenticated using (true);

drop policy if exists "public read variants" on public.variants;
create policy "public read variants" on public.variants
  for select to anon, authenticated using (true);

drop policy if exists "public read homepage_sections" on public.homepage_sections;
create policy "public read homepage_sections" on public.homepage_sections
  for select to anon, authenticated using (is_active = true);

drop policy if exists "public read site_settings" on public.site_settings;
create policy "public read site_settings" on public.site_settings
  for select to anon, authenticated using (true);

-- Customers: a user can read only their own customer row.
drop policy if exists "read own customer" on public.customers;
create policy "read own customer" on public.customers
  for select to authenticated using (auth_uid = auth.uid());

-- Orders: a signed-in customer can read their own orders and items.
-- Guest checkout inserts run through the service-role server action, so the
-- anon key never needs write access here.
drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select to authenticated using (
    exists (
      select 1 from public.customers c
      where c.id = orders.customer_id and c.auth_uid = auth.uid()
    )
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = order_items.order_id and c.auth_uid = auth.uid()
    )
  );

-- Note: all writes to catalog, orders, homepage, and settings are performed
-- server-side with the service-role key, which bypasses RLS. The anon key can
-- only read the catalog. Admin identity is re-checked in every server action.

-- ---------- Storage bucket for product images -------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public read product-images" on storage.objects;
create policy "public read product-images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
-- Uploads use the service-role client (bypasses RLS); no write policy needed.

-- ============================================================================
-- Seed data
-- ============================================================================

insert into public.site_settings (id, store_name, contact_email, contact_phone, currency, delivery_fee, delivery_areas, low_stock_threshold, cod_notes)
values (1, 'Atlas Clothier', 'ali.hassooo11@gmail.com', '+92 300 0000000', 'PKR', 250,
        array['Karachi','Lahore','Islamabad','Rawalpindi','Faisalabad'], 5,
        'Pay with cash when your order arrives.')
on conflict (id) do update set
  store_name      = excluded.store_name,
  contact_email   = excluded.contact_email,
  contact_phone   = excluded.contact_phone,
  currency        = excluded.currency,
  delivery_fee    = excluded.delivery_fee,
  delivery_areas  = excluded.delivery_areas,
  cod_notes       = excluded.cod_notes;

insert into public.categories (name, slug, sort_order, is_active) values
  ('Hoodies', 'hoodies', 1, true),
  ('T-shirts', 't-shirts', 2, true)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

-- Capture category ids for seeding products.
do $$
declare
  hoodies_id uuid;
  tees_id    uuid;
  p_simple   uuid;
  p_variant  uuid;
  p_tee1     uuid;
  p_tee2     uuid;
begin
  select id into hoodies_id from public.categories where slug = 'hoodies';
  select id into tees_id    from public.categories where slug = 't-shirts';

  -- Hoodies: one simple product, one variant product.
  insert into public.products (category_id, title, slug, description, price, has_variants, stock, is_featured, is_active)
  values (hoodies_id, 'Heavyweight Hoodie', 'heavyweight-hoodie',
          'A thick, warm winter hoodie built for cold mornings.', 4500, false, 15, true, true)
  on conflict (slug) do update set title = excluded.title, price = excluded.price, has_variants = false, stock = excluded.stock
  returning id into p_simple;

  insert into public.products (category_id, title, slug, description, price, has_variants, stock, is_featured, is_active)
  values (hoodies_id, 'Colorblock Hoodie', 'colorblock-hoodie',
          'Contrast panel hoodie in three colorways.', 5200, true, null, false, true)
  on conflict (slug) do update set title = excluded.title, price = excluded.price, has_variants = true, stock = null
  returning id into p_variant;

  insert into public.variants (product_id, size, color, stock, sku)
  values
    (p_variant, 'M', 'Black', 8,  'CB-HD-BLK-M'),
    (p_variant, 'L', 'Black', 6,  'CB-HD-BLK-L'),
    (p_variant, 'M', 'Grey',  4,  'CB-HD-GRY-M')
  on conflict do nothing;

  -- T-shirts: one simple, one variant.
  insert into public.products (category_id, title, slug, description, price, has_variants, stock, is_featured, is_active)
  values (tees_id, 'Everyday Tee', 'everyday-tee',
          'A soft everyday cotton tee for the summer.', 1800, false, 40, true, true)
  on conflict (slug) do update set title = excluded.title, price = excluded.price, has_variants = false, stock = excluded.stock
  returning id into p_tee1;

  insert into public.products (category_id, title, slug, description, price, has_variants, stock, is_featured, is_active)
  values (tees_id, 'Striped Tee', 'striped-tee',
          'Breathing striped tee in two tones.', 2200, true, null, false, true)
  on conflict (slug) do update set title = excluded.title, price = excluded.price, has_variants = true, stock = null
  returning id into p_tee2;

  insert into public.variants (product_id, size, color, stock, sku)
  values
    (p_tee2, 'S', 'White', 10, 'ST-TE-WHT-S'),
    (p_tee2, 'M', 'White', 12, 'ST-TE-WHT-M'),
    (p_tee2, 'L', 'Navy',  7,  'ST-TE-NVY-L')
  on conflict do nothing;

  -- Seed two image rows per product. Replace these files in the
  -- product-images bucket (or upload new ones from the admin panel).
  insert into public.product_images (product_id, storage_path, sort_order)
  select p_simple, 'seed/heavyweight-hoodie-01.jpg', 1 where not exists (select 1 from public.product_images where product_id = p_simple)
  union all select p_simple, 'seed/heavyweight-hoodie-02.jpg', 2 where not exists (select 1 from public.product_images where product_id = p_simple)
  union all select p_variant, 'seed/colorblock-hoodie-01.jpg', 1 where not exists (select 1 from public.product_images where product_id = p_variant)
  union all select p_variant, 'seed/colorblock-hoodie-02.jpg', 2 where not exists (select 1 from public.product_images where product_id = p_variant)
  union all select p_tee1, 'seed/everyday-tee-01.jpg', 1 where not exists (select 1 from public.product_images where product_id = p_tee1)
  union all select p_tee1, 'seed/everyday-tee-02.jpg', 2 where not exists (select 1 from public.product_images where product_id = p_tee1)
  union all select p_tee2, 'seed/striped-tee-01.jpg', 1 where not exists (select 1 from public.product_images where product_id = p_tee2)
  union all select p_tee2, 'seed/striped-tee-02.jpg', 2 where not exists (select 1 from public.product_images where product_id = p_tee2);

  -- Homepage sections: hero + one section per category + featured.
  insert into public.homepage_sections (type, category_id, title, sort_order, is_active, config)
  select 'hero', null, null, 0, true,
         jsonb_build_object('heading', 'Seasonal clothing, made well.',
                            'subtext', 'Hoodies and jackets for winter, tees for summer. Cash on delivery.',
                            'cta_label', 'Shop the collection',
                            'cta_href', '/shop',
                            'image_path', 'seed/hero.jpg')
  where not exists (select 1 from public.homepage_sections where type = 'hero');

  insert into public.homepage_sections (type, category_id, title, sort_order, is_active, config)
  select 'category', hoodies_id, 'Hoodies', 1, true, '{}'::jsonb
  where not exists (select 1 from public.homepage_sections where type = 'category' and category_id = hoodies_id);

  insert into public.homepage_sections (type, category_id, title, sort_order, is_active, config)
  select 'category', tees_id, 'T-shirts', 2, true, '{}'::jsonb
  where not exists (select 1 from public.homepage_sections where type = 'category' and category_id = tees_id);

  insert into public.homepage_sections (type, category_id, title, sort_order, is_active, config)
  select 'featured', null, 'Featured', 3, true,
         jsonb_build_object('product_ids', jsonb_build_array(p_simple, p_tee1))
  where not exists (select 1 from public.homepage_sections where type = 'featured');
end;
$$;
