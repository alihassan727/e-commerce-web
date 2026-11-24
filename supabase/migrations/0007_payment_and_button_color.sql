-- ============================================================================
-- Atlas Clothier - 0007: Payment gateway config table + button color setting
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Global button color in site_settings
-- ---------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists button_color text not null default '#A8472D';

-- ---------------------------------------------------------------------------
-- 2. Payment gateway configuration table
--
-- Stores per-gateway settings. Secret credentials live here server-side and
-- are NEVER exposed to the browser through any public endpoint or policy.
-- The table has no public read policy — only the service-role key (used
-- exclusively in server actions) can read or write it.
--
-- `credentials` is a JSONB column. For Safepay it stores:
--   { "environment": "sandbox|live", "public_key": "...", "secret_key": "...",
--     "webhook_secret": "..." }
-- For PayFast it stores:
--   { "environment": "sandbox|live", "merchant_id": "...", "secured_key": "..." }
-- Secret values should be rotated before activating a gateway in production.
--
-- `is_active` is intentionally false for all gateways by default.
-- Only COD is active, managed separately in site_settings.cod_notes.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_gateway_config (
  id          uuid    primary key default gen_random_uuid(),
  gateway     text    unique not null,  -- 'safepay' | 'payfast'
  is_active   boolean not null default false,
  credentials jsonb   not null default '{}',
  updated_at  timestamptz not null default now()
);

drop trigger if exists payment_gateway_config_set_updated_at on public.payment_gateway_config;
create trigger payment_gateway_config_set_updated_at
  before update on public.payment_gateway_config
  for each row execute function public.set_updated_at();

-- Seed placeholder rows so the admin UI always has rows to display.
-- `is_active` is false; credentials are empty. These are display-only records.
insert into public.payment_gateway_config (gateway, is_active, credentials)
values
  ('safepay', false, '{}'),
  ('payfast', false, '{}')
on conflict (gateway) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — NO public access to payment credentials
-- ---------------------------------------------------------------------------
alter table public.payment_gateway_config enable row level security;

-- No SELECT policy for anon or authenticated.
-- All reads and writes go through server actions using the service-role key,
-- which bypasses RLS. This ensures credentials are never reachable via the
-- PostgREST REST API with the anon or user JWT.
