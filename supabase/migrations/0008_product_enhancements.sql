-- ============================================================================
-- Atlas Clothier - 0008: Product variant enhancements + reviews
--
-- Changes are ADDITIVE ONLY. No existing columns, tables, or data are
-- modified or removed. All new columns have safe defaults.
--
-- 1. Extend the variants table (sale price, color swatch, active flag)
-- 2. Add variant_id FK to product_images (for per-variant images)
-- 3. Add size_snapshot + image_snapshot_url to order_items
-- 4. Add branding columns to site_settings (text logo support)
-- 5. Create product_reviews table with RLS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend variants
-- ---------------------------------------------------------------------------
alter table public.variants
  add column if not exists sale_price  numeric(10,2),
  add column if not exists color_hex   text,           -- e.g. #000000 for swatch display
  add column if not exists is_active   boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Per-variant product images
--    variant_id is nullable — existing rows (product-level images) stay as-is.
--    When set, the image belongs to that variant specifically.
-- ---------------------------------------------------------------------------
alter table public.product_images
  add column if not exists variant_id uuid references public.variants(id) on delete set null;

create index if not exists idx_product_images_variant
  on public.product_images(variant_id)
  where variant_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Order items — add size_snapshot so we store the specific size chosen,
--    separate from the variant_label (which combines color+size)
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists size_snapshot         text,
  add column if not exists image_snapshot_url    text;  -- URL at time of purchase

-- ---------------------------------------------------------------------------
-- 4. Text logo branding for site_settings
-- ---------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists logo_mode         text not null default 'image',  -- 'image' | 'text'
  add column if not exists logo_text         text,
  add column if not exists logo_font         text not null default 'serif',
  add column if not exists logo_font_size    text not null default '1.5rem',
  add column if not exists logo_font_weight  text not null default '400',
  add column if not exists logo_color        text not null default '#1B1A18',
  add column if not exists logo_letter_spacing text not null default 'normal';

-- ---------------------------------------------------------------------------
-- 5. Product reviews
-- ---------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id           uuid    primary key default gen_random_uuid(),
  product_id   uuid    not null references public.products(id) on delete cascade,
  customer_id  uuid    references public.customers(id) on delete set null,
  order_id     uuid    references public.orders(id) on delete set null,
  rating       integer not null check (rating >= 1 and rating <= 5),
  review_text  text,
  status       text    not null default 'pending',   -- pending | approved | hidden
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_reviews_product
  on public.product_reviews(product_id, status);

create index if not exists idx_reviews_customer
  on public.product_reviews(customer_id);

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

-- RLS: customers can read approved reviews; authenticated user can read own
alter table public.product_reviews enable row level security;

drop policy if exists "public read approved reviews" on public.product_reviews;
create policy "public read approved reviews" on public.product_reviews
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "read own reviews" on public.product_reviews;
create policy "read own reviews" on public.product_reviews
  for select to authenticated
  using (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

-- Writes go through service-role server actions (bypasses RLS).

-- ---------------------------------------------------------------------------
-- 6. Add index on order_items for review eligibility checks
-- ---------------------------------------------------------------------------
create index if not exists idx_order_items_product
  on public.order_items(product_id)
  where product_id is not null;
