-- ============================================================================
-- Atlas Clothier - 0003: CRM tables
-- Adds extended customer profile columns, multiple delivery addresses,
-- support tickets, and ticket admin notes.
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Apply in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend existing customers table
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists address     text,
  add column if not exists city        text,
  add column if not exists postal_code text,
  add column if not exists avatar_url  text;

-- ---------------------------------------------------------------------------
-- 2. Multiple saved delivery addresses per customer
-- ---------------------------------------------------------------------------
create table if not exists public.customer_addresses (
  id          uuid    primary key default gen_random_uuid(),
  customer_id uuid    not null references public.customers(id) on delete cascade,
  label       text    not null default 'Home',  -- Home | Office | Other
  full_name   text    not null,
  phone       text,
  address     text    not null,
  city        text    not null,
  postal_code text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_customer_addresses_customer
  on public.customer_addresses(customer_id);

-- ---------------------------------------------------------------------------
-- 3. Support tickets
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id            uuid    primary key default gen_random_uuid(),
  ticket_number text    unique not null,
  customer_id   uuid    references public.customers(id) on delete set null,
  customer_name text    not null,
  email         text    not null,
  phone         text,
  subject       text    not null,
  category      text    not null,
  order_id      uuid    references public.orders(id) on delete set null,
  description   text    not null,
  status        text    not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_support_tickets_customer
  on public.support_tickets(customer_id);
create index if not exists idx_support_tickets_status
  on public.support_tickets(status);
create index if not exists idx_support_tickets_created
  on public.support_tickets(created_at desc);

-- Auto-update updated_at
drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Admin-only ticket notes (private, never shown to customer)
-- ---------------------------------------------------------------------------
create table if not exists public.ticket_notes (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  note       text not null,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_notes_ticket
  on public.ticket_notes(ticket_id);

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.customer_addresses enable row level security;
alter table public.support_tickets    enable row level security;
alter table public.ticket_notes       enable row level security;

-- customer_addresses: authenticated user can read/write only their own rows.
drop policy if exists "owner read addresses"   on public.customer_addresses;
drop policy if exists "owner insert addresses" on public.customer_addresses;
drop policy if exists "owner update addresses" on public.customer_addresses;
drop policy if exists "owner delete addresses" on public.customer_addresses;

create policy "owner read addresses" on public.customer_addresses
  for select to authenticated
  using (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

create policy "owner insert addresses" on public.customer_addresses
  for insert to authenticated
  with check (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

create policy "owner update addresses" on public.customer_addresses
  for update to authenticated
  using (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

create policy "owner delete addresses" on public.customer_addresses
  for delete to authenticated
  using (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

-- support_tickets: authenticated customer can read their own tickets.
-- All writes (insert, update) go through the service-role server action.
drop policy if exists "read own tickets" on public.support_tickets;
create policy "read own tickets" on public.support_tickets
  for select to authenticated
  using (customer_id = (
    select id from public.customers where auth_uid = auth.uid()
  ));

-- ticket_notes: no public or authenticated read.
-- All access is via service-role (admin server actions bypass RLS).
-- (No create policy = no access for anon/authenticated)
