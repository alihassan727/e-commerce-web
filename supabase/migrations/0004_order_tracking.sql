-- ============================================================================
-- Atlas Clothier - 0004: Order tracking events
-- Creates an immutable log of delivery progress updates per order.
-- Never deletes or overwrites previous events.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.order_tracking_events (
  id          uuid    primary key default gen_random_uuid(),
  order_id    uuid    not null references public.orders(id) on delete cascade,
  status      text    not null,        -- e.g. 'confirmed', 'dispatched', 'delivered'
  description text,                    -- admin-provided note shown to customer
  created_at  timestamptz not null default now(),
  created_by  text    not null default 'system'  -- admin email or 'system'
);

create index if not exists idx_order_tracking_order
  on public.order_tracking_events(order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.order_tracking_events enable row level security;

-- Customers can read tracking events for their own orders.
drop policy if exists "read own tracking events" on public.order_tracking_events;
create policy "read own tracking events" on public.order_tracking_events
  for select to authenticated
  using (order_id in (
    select o.id
    from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.auth_uid = auth.uid()
  ));

-- Public (guest) can read events for an order they look up by id + email.
-- This is enforced at the application layer (canViewOrder check), not via RLS,
-- because the guest is anonymous and the email match cannot be done in a
-- Supabase policy without exposing the email column to anon.
-- All reads for guests go through the service-role server action.
