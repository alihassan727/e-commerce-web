-- ============================================================================
-- Atlas Clothier - 0009: Color-level product variant architecture
--
-- Adds a normalized color layer on top of the existing size/color `variants`
-- table so that each color can own:
--   - its own title / swatch / SKU (optional)
--   - its own regular + sale price (source of truth for new purchases)
--   - its own image gallery
--   - its own active flag
-- while size-level inventory stays in `variants` (one row per size).
--
-- ORDERING: run AFTER 0008_product_enhancements.sql. The backfill below reads
-- `variants.color_hex` and `variants.sale_price`, which are added in 0008.
--
-- SAFETY:
--   * ADDITIVE ONLY. No existing table, column, or row is dropped or deleted.
--   * Existing product IDs, variant IDs, stock, size-level SKUs, product-level
--     images, and historical order references are all preserved.
--   * `variants` rows are never removed; they only gain a nullable color_id.
--   * Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING / idempotent UPDATE).
--
-- Do NOT run this against production from the coding agent. Apply manually in
-- the Supabase SQL editor after 0008.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Color-level entity
-- ---------------------------------------------------------------------------
create table if not exists public.product_colors (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  name          text not null,                       -- e.g. 'Black', 'Navy Blue'
  color_hex     text,                                 -- e.g. '#000000' for swatch
  title         text,                                 -- optional per-color title override
  sku           text,                                 -- optional color-level SKU
  regular_price numeric(10,2) not null default 0,     -- source of truth
  sale_price    numeric(10,2),                        -- optional; must be < regular_price
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- One color name per product (case-sensitive; the server action enforces
-- case-insensitive uniqueness before insert as well).
create unique index if not exists idx_product_colors_product_name
  on public.product_colors (product_id, name);

create index if not exists idx_product_colors_product
  on public.product_colors (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Per-color image gallery (separate from product-level product_images)
-- ---------------------------------------------------------------------------
create table if not exists public.color_images (
  id           uuid primary key default gen_random_uuid(),
  color_id     uuid not null references public.product_colors(id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_color_images_color
  on public.color_images (color_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Link size-level variants to their color (nullable for legacy safety)
-- ---------------------------------------------------------------------------
alter table public.variants
  add column if not exists color_id uuid references public.product_colors(id) on delete set null;

create index if not exists idx_variants_color
  on public.variants (color_id)
  where color_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Order item color snapshot (size/image snapshots are added in 0008)
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists color_snapshot text;

-- ---------------------------------------------------------------------------
-- 5. Backfill: one product_colors row per distinct (product, color)
--    NULL / empty colors are grouped under a safe 'Default' name so no legacy
--    variant is lost or silently discarded.
-- ---------------------------------------------------------------------------
with normalized as (
  select
    v.product_id,
    case
      when v.color is null or btrim(v.color) = '' then '__default__'
      else btrim(v.color)
    end as color_key,
    coalesce(nullif(btrim(v.color), ''), 'Default') as color_name,
    v.color_hex,
    v.sale_price
  from public.variants v
  join public.products p on p.id = v.product_id
  where p.has_variants = true
)
insert into public.product_colors
  (product_id, name, color_hex, regular_price, sale_price, is_active, sort_order)
select
  n.product_id,
  n.color_name,
  (array_agg(n.color_hex) filter (where n.color_hex is not null))[1],
  p.price,
  (array_agg(n.sale_price) filter (where n.sale_price is not null))[1],
  true,
  (row_number() over (partition by n.product_id order by n.color_name) - 1)
from normalized n
join public.products p on p.id = n.product_id
group by n.product_id, n.color_key, n.color_name, p.price
on conflict (product_id, name) do nothing;

-- Link existing size-level variants to their backfilled color. Matching is by
-- product + normalized color name; 'Default' collects NULL/empty colors.
update public.variants v
set color_id = pc.id
from public.product_colors pc
where pc.product_id = v.product_id
  and pc.name = coalesce(nullif(btrim(v.color), ''), 'Default')
  and v.color_id is null;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
--    Public can read active colors and images of active colors.
--    All writes go through service-role server actions (bypass RLS).
-- ---------------------------------------------------------------------------
alter table public.product_colors enable row level security;
alter table public.color_images   enable row level security;

drop policy if exists "public read active colors" on public.product_colors;
create policy "public read active colors" on public.product_colors
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists "public read color images" on public.color_images;
create policy "public read color images" on public.color_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.product_colors pc
      where pc.id = color_images.color_id and pc.is_active = true
    )
  );

-- No INSERT/UPDATE/DELETE policies: writes use the service-role key only.