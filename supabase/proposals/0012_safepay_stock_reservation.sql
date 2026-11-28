-- ============================================================================
-- Atlas Clothier — PROPOSAL 0012: Safepay Sandbox, Option A
-- Reserve Stock -> Create Payment Session -> Verify Payment -> Confirm Order
--
-- STATUS: NOT APPLIED. Deliberately outside supabase/migrations/ so it is never
-- auto-run. Review every section, test on a staging database, then apply
-- manually in the Supabase SQL editor (or promote to a numbered migration).
--
-- HARD RULES OBSERVED BY THIS FILE
--   * Additive only at the schema level; no column, table, row or policy is
--     dropped or renamed.
--   * Existing COD columns/behaviour are untouched. `confirm_order(uuid)` is
--     NOT modified.
--   * No enum change to public.order_status. Online orders reuse `pending` and
--     become `confirmed` only after verified payment.
--   * No Safepay credential is read, written or activated here.
--
-- DESIGN SUMMARY (see comments per section)
--   1. Stock is HELD at reservation time: the exact product/variant rows are
--      decremented immediately and the exact quantities are recorded in
--      stock_reservation_items. Release adds the same quantities back.
--      Rationale: `confirm_order` (COD/n8n) is left byte-for-byte unchanged and
--      still sees only on-hand stock, so COD can never oversell units that an
--      online checkout is holding, and online finalisation never deducts twice
--      (it deducts nothing at finalisation). A separate `reserved` counter
--      would require rewriting confirm_order's deduction logic to keep the
--      invariant `reserved <= stock`, which would change COD outcomes.
--   2. Reservations expire after 15 minutes. Expiry is enforced by:
--        (a) a scheduled sweep, if pg_cron is enabled, OR a Vercel Cron route
--            calling expire_stale_reservations();
--        (b) lazy expiry inside reserve/finalize for the order being handled;
--        (c) every expiry/release path is idempotent.
--   3. Payment state lives on orders (payment_method/payment_status/...) and in
--      payment_transactions. It is kept separate from fulfilment status.
--   4. Webhook delivery is an inbox, not a boolean: payment_webhook_events has
--      a unique (gateway, provider_event_id) key, a processing lease and a
--      retry/backoff state. Only a PROCESSED/IGNORED event is skipped; failed
--      and abandoned 'processing' events are reclaimable by one worker at a time.
--   5. A BEFORE UPDATE trigger blocks any `status -> confirmed` transition for a
--      non-COD order unless it is made by finalize_paid_order (transaction-local
--      GUC). This is the database-level guarantee that a stale n8n workflow or
--      a manual confirm_order call can never confirm/deduct an unpaid online
--      order.
--   6. A held reservation always keeps its exact product/variant references:
--      stock_reservation_items.product_id is NOT NULL, both FKs are RESTRICT,
--      and delete guards block hard deletion. Soft-disable (is_active=false)
--      remains the supported way to retire a product or variant.
--   7. payment_transactions is insert-only. Refunds are recorded in
--      payment_refunds and the order payment_status; no ledger row is updated.
--
-- LOCK ORDERING (must match public.confirm_order to avoid deadlocks)
--   1. public.orders row            (FOR UPDATE)
--   2. public.stock_reservations row (FOR UPDATE, when applicable)
--   3. public.order_items rows      (FOR UPDATE, ORDER BY id)
--   4. public.variants rows         (FOR UPDATE, ORDER BY id)
--   5. public.products rows         (FOR UPDATE, ORDER BY id)
--   All new functions follow this sequence. confirm_order uses 1,3,4,5 and never
--   touches reservations, so the extra step 2 cannot introduce a cycle with it.
--
-- PREFLIGHT (read-only; run these first and confirm the expected results)
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='orders'
--    order by column_name;                       -- expect no payment_* columns
--   select to_regclass('public.stock_reservations');      -- expect NULL
--   select to_regclass('public.payment_transactions');    -- expect NULL
--   select count(*) from public.orders;                   -- baseline for rollback
--   select count(*) from public.variants;                 -- baseline for rollback
--   -- pg_cron is AVAILABLE on Supabase but is NOT assumed to be enabled:
--   select extname from pg_extension where extname = 'pg_cron';  -- expect 0 rows
--
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Order payment columns (separate from fulfilment status)
-- ============================================================================
-- payment_method defaults to 'cod' so every existing row and every existing
-- COD insert in lib/actions/orders.ts keeps its current meaning without any
-- application change. payment_status defaults to 'not_required' for the same
-- reason; the online flow must explicitly insert 'pending'.
--
-- All columns are nullable/defaulted, so adding them is safe on live data.

alter table public.orders
  add column if not exists payment_method   text not null default 'cod',
  add column if not exists payment_status   text not null default 'not_required',
  add column if not exists payment_gateway  text,
  add column if not exists payment_amount   numeric(10,2),
  add column if not exists payment_currency text not null default 'PKR',
  add column if not exists paid_at          timestamptz;

-- Named constraints are added defensively (ADD CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_method_check'
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (payment_method in ('cod', 'safepay', 'payfast'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_status_check'
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in (
        'not_required',      -- COD: no online payment is expected
        'unpaid',            -- online order created, no session yet
        'pending',           -- payment session created / awaiting provider
        'paid',
        'failed',
        'cancelled',
        'expired',           -- reservation expired before payment
        'refunded',
        'partially_refunded'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_paid_at_check'
  ) then
    alter table public.orders
      add constraint orders_paid_at_check
      check (payment_status <> 'paid' or paid_at is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_cod_payment_status_check'
  ) then
    -- COD orders are never 'pending'/'paid' through an online gateway.
    alter table public.orders
      add constraint orders_cod_payment_status_check
      check (
        payment_method <> 'cod'
        or payment_status in ('not_required', 'cancelled', 'refunded')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_online_payment_status_check'
  ) then
    -- 'not_required' is reserved for COD. An online order must explicitly set
    -- 'unpaid' or 'pending' when it is created, so a forgotten field cannot
    -- masquerade as "no payment needed".
    alter table public.orders
      add constraint orders_online_payment_status_check
      check (payment_method = 'cod' or payment_status <> 'not_required');
  end if;
end $$;

comment on column public.orders.payment_method is
  'cod | safepay | payfast. Immutable in practice; defaults to cod for legacy/COD inserts.';
comment on column public.orders.payment_status is
  'Online payment state only. Independent of the fulfilment enum in orders.status.';
comment on column public.orders.payment_currency is
  'Currency the gateway charge is expected in. Must match the provider payload.';
comment on column public.orders.paid_at is
  'Set only by record_verified_payment()/finalize_paid_order() after a trusted server-side verification.';


-- ============================================================================
-- SECTION 2 — Stock reservation tables
-- ============================================================================
-- stock_reservations is the header (one order can have retries after expiry,
-- so order_id is NOT globally unique; a partial unique index allows only one
-- ACTIVE reservation per order).
--
-- stock_reservation_items records the exact quantities that were decremented
-- from `variants.stock` / `products.stock`, so release can restore precisely
-- what was taken. Snapshots are for audit only.

create table if not exists public.stock_reservations (
  id             uuid primary key default gen_random_uuid(),
  -- RESTRICT: deleting an order while a hold exists would silently strand the
  -- held units. Release the reservation first (or cancel the order).
  order_id       uuid not null references public.orders(id) on delete restrict,
  status         text not null default 'active',
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  released_at    timestamptz,
  finalized_at   timestamptz,
  release_reason text,
  constraint stock_reservations_status_check
    check (status in ('active', 'released', 'expired', 'finalized')),
  constraint stock_reservations_expiry_check
    check (expires_at > created_at)
);

-- At most one live hold per order.
create unique index if not exists uq_stock_reservations_one_active
  on public.stock_reservations (order_id)
  where status = 'active';

-- Sweep index: find expired active holds cheaply.
create index if not exists idx_stock_reservations_expiry
  on public.stock_reservations (expires_at)
  where status = 'active';

create index if not exists idx_stock_reservations_order
  on public.stock_reservations (order_id, created_at desc);

drop trigger if exists stock_reservations_set_updated_at on public.stock_reservations;
create trigger stock_reservations_set_updated_at
  before update on public.stock_reservations
  for each row execute function public.set_updated_at();

create table if not exists public.stock_reservation_items (
  id                     uuid primary key default gen_random_uuid(),
  reservation_id         uuid not null references public.stock_reservations(id) on delete cascade,
  -- RESTRICT (never SET NULL): an active hold must always be able to restore
  -- exactly what it took. Products/variants are soft-disabled (is_active =
  -- false) instead of hard-deleted while reservation history references them.
  product_id             uuid not null references public.products(id) on delete restrict,
  variant_id             uuid references public.variants(id) on delete restrict,
  title_snapshot         text,
  variant_label_snapshot text,
  quantity               integer not null check (quantity > 0),
  created_at             timestamptz not null default now()
);

create index if not exists idx_stock_reservation_items_reservation
  on public.stock_reservation_items (reservation_id);

comment on table public.stock_reservations is
  'Option A holds. Stock is decremented at reservation time; expiry/release/cancel restores it. Finalisation performs no further deduction.';
comment on table public.stock_reservation_items is
  'Exact quantities deducted per product/variant. product_id is NOT NULL and both FKs are ON DELETE RESTRICT, so an active hold can always restore its exact stock. Hard-deleting a referenced product/variant is blocked; use is_active = false.';

-- Friendly guard in front of the FK: explains the soft-disable requirement
-- instead of surfacing only a generic foreign-key error. Active holds are
-- always protected by the FK itself; this trigger covers reservation history
-- as well, because a consumed hold is the audit evidence for deducted stock.
create or replace function public.prevent_reserved_stock_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    if exists (
      select 1 from public.stock_reservation_items sri
      where sri.product_id = old.id
    ) then
      raise exception
        'Product % is referenced by stock reservation history. Soft-disable it (is_active = false) instead of deleting it.',
        old.id
        using errcode = 'foreign_key_violation';
    end if;
  elsif tg_table_name = 'variants' then
    if exists (
      select 1 from public.stock_reservation_items sri
      where sri.variant_id = old.id
    ) then
      raise exception
        'Variant % is referenced by stock reservation history. Soft-disable it (is_active = false) instead of deleting it.',
        old.id
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists products_prevent_reserved_delete on public.products;
create trigger products_prevent_reserved_delete
  before delete on public.products
  for each row execute function public.prevent_reserved_stock_delete();

drop trigger if exists variants_prevent_reserved_delete on public.variants;
create trigger variants_prevent_reserved_delete
  before delete on public.variants
  for each row execute function public.prevent_reserved_stock_delete();


-- ============================================================================
-- SECTION 3 — Payment ledger, webhook events, refunds
-- ============================================================================

create table if not exists public.payment_transactions (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete restrict,
  gateway                 text not null check (gateway in ('safepay', 'payfast')),
  environment             text not null default 'sandbox'
                            check (environment in ('sandbox', 'live')),
  provider_transaction_id text not null,
  provider_reference      text,
  status                  text not null default 'initiated'
                            check (status in (
                              'initiated', 'pending', 'succeeded', 'failed',
                              'cancelled'
                            )),
  amount                  numeric(10,2) not null check (amount >= 0),
  currency                text not null default 'PKR',
  payload                 jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  -- No updated_at: this ledger is insert-only. Refund state is derived from
  -- public.payment_refunds, so a captured row is never mutated.
  -- Environment is part of the key: sandbox and live provider ids must never
  -- collide with each other.
  constraint payment_transactions_gateway_txn_key
    unique (gateway, environment, provider_transaction_id)
);

create index if not exists idx_payment_transactions_order
  on public.payment_transactions (order_id, created_at desc);

create index if not exists idx_payment_transactions_reference
  on public.payment_transactions (provider_reference)
  where provider_reference is not null;

comment on table public.payment_transactions is
  'Insert-only (immutable) provider ledger. Rows are written once and never updated; refund state is derived from public.payment_refunds. Unique (gateway, environment, provider_transaction_id) is the primary duplicate-payment guard.';

create table if not exists public.payment_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  gateway           text not null check (gateway in ('safepay', 'payfast')),
  provider_event_id text not null,
  event_type        text,
  payload           jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
                      check (processing_status in (
                        'received', 'processing', 'processed', 'ignored', 'failed'
                      )),
  attempts          integer not null default 0 check (attempts >= 0),
  last_error        text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  -- Retry/lease state. A fresh 'processing' row is owned by one worker until
  -- locked_at is older than the lease; then it is reclaimable.
  locked_at         timestamptz,
  lock_token        uuid,
  next_attempt_at   timestamptz default now(),
  constraint payment_webhook_events_gateway_event_key
    unique (gateway, provider_event_id)
);

create index if not exists idx_payment_webhook_events_status
  on public.payment_webhook_events (processing_status, next_attempt_at);

comment on table public.payment_webhook_events is
  'Webhook inbox. Unique (gateway, provider_event_id) deduplicates delivery; processing_status + lock_token + locked_at make claiming, retrying and crash recovery safe. Only processed/ignored events are skipped.';

create table if not exists public.payment_refunds (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  -- A refund must always point at the captured transaction. RESTRICT/NOT NULL
  -- keeps the association intact for idempotency and audit; refunds are derived
  -- from this table, never written back to the immutable ledger.
  transaction_id      uuid not null references public.payment_transactions(id) on delete restrict,
  gateway             text not null check (gateway in ('safepay', 'payfast')),
  environment         text not null default 'sandbox'
                        check (environment in ('sandbox', 'live')),
  provider_refund_id  text not null,
  amount              numeric(10,2) not null check (amount > 0),
  currency            text not null default 'PKR',
  status              text not null default 'requested'
                        check (status in ('requested', 'processing', 'succeeded', 'failed')),
  reason              text,
  provider_payload    jsonb not null default '{}'::jsonb,
  created_by          text not null default 'system',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payment_refunds_gateway_refund_key
    unique (gateway, environment, provider_refund_id)
);

create index if not exists idx_payment_refunds_order
  on public.payment_refunds (order_id, created_at desc);

drop trigger if exists payment_refunds_set_updated_at on public.payment_refunds;
create trigger payment_refunds_set_updated_at
  before update on public.payment_refunds
  for each row execute function public.set_updated_at();

comment on table public.payment_refunds is
  'Verified refund records. record_verified_refund() is the only writer; refund execution against Safepay and any restock policy remain out of scope.';


-- ============================================================================
-- SECTION 4 — Database-level confirmation guards (COD compatibility)
-- ============================================================================
-- Guard A: an order whose payment_method is not 'cod' may only move to
--          'confirmed' when the caller has set the transaction-local flag
--          atlas.allow_paid_confirmation = 'on'. finalize_paid_order() does that
--          after recording a verified payment. Any other caller — including a
--          stale n8n workflow calling confirm_order(uuid) — raises.
--          COD orders (payment_method = 'cod') are completely unaffected.
--
-- Guard B: payment_status may only become paid/refunded/partially_refunded when
--          atlas.allow_payment_write = 'on' (set by record_verified_payment /
--          refund code). This prevents an accidental service-role UPDATE from
--          marking an order paid.
--
-- Both flags are transaction-local (set_config(..., true)) and disappear at
-- COMMIT/ROLLBACK.

create or replace function public.guard_order_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Payment method is immutable once the order exists.
  if new.payment_method is distinct from old.payment_method then
    raise exception
      'orders.payment_method is immutable (order %)', new.id
      using errcode = 'check_violation';
  end if;

  -- 2) Payment metadata may only change inside a trusted payment/refund
  --    function. Ordinary admin/fulfilment updates never touch these fields.
  if (new.payment_gateway  is distinct from old.payment_gateway
      or new.payment_amount   is distinct from old.payment_amount
      or new.payment_currency is distinct from old.payment_currency
      or new.paid_at          is distinct from old.paid_at)
     and coalesce(current_setting('atlas.allow_payment_write', true), '') <> 'on'
  then
    raise exception
      'Order % payment metadata can only be changed by a trusted payment/refund function',
      new.id
      using errcode = 'check_violation';
  end if;

  -- 3) A paid order can never be downgraded to an unpaid/failed/expired state.
  --    Refund transitions are handled separately below.
  if old.payment_status = 'paid'
     and new.payment_status in (
       'not_required', 'unpaid', 'pending', 'failed', 'cancelled', 'expired'
     )
  then
    raise exception
      'Paid order % cannot be downgraded to payment_status %',
      new.id, new.payment_status
      using errcode = 'check_violation';
  end if;

  -- 4) Refunded is terminal. A partial refund may become fully refunded.
  if old.payment_status in ('refunded', 'partially_refunded')
     and new.payment_status not in ('refunded', 'partially_refunded')
  then
    raise exception
      'Refunded order % cannot move back to payment_status %',
      new.id, new.payment_status
      using errcode = 'check_violation';
  end if;

  -- 5) Entering paid/refunded requires a trusted function (the flag).
  if new.payment_status is distinct from old.payment_status
     and new.payment_status in ('paid', 'refunded', 'partially_refunded')
     and coalesce(current_setting('atlas.allow_payment_write', true), '') <> 'on'
  then
    raise exception
      'Order % payment_status cannot be set to % outside a verified payment function',
      new.id, new.payment_status
      using errcode = 'check_violation';
  end if;

  -- 6) No online confirmation outside finalize_paid_order.
  if new.status = 'confirmed'::public.order_status
     and old.status is distinct from 'confirmed'::public.order_status
     and new.payment_method <> 'cod'
     and coalesce(current_setting('atlas.allow_paid_confirmation', true), '') <> 'on'
  then
    raise exception
      'Order % cannot be confirmed: online payment is not verified (payment_status=%)',
      new.id, new.payment_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_payment_state on public.orders;
create trigger orders_guard_payment_state
  before update on public.orders
  for each row execute function public.guard_order_payment_state();


-- ============================================================================
-- SECTION 5 — RPC: reserve_order_stock
-- ============================================================================
-- Idempotent:
--   * order row is locked first, serialising concurrent reservations for the
--     same order;
--   * an existing ACTIVE, unexpired reservation is returned unchanged;
--   * an existing ACTIVE but expired reservation is released inside the same
--     transaction, then a fresh hold is created.
-- Multi-item atomicity: every line is validated and checked BEFORE any stock is
-- updated; a shortage returns without modifying anything.
-- Oversell: stock rows are locked and decremented in one transaction, so two
-- concurrent checkouts cannot both pass the availability check.
-- COD safety: reserations are refused for payment_method = 'cod'.

create or replace function public.reserve_order_stock(
  p_order_id    uuid,
  p_ttl_seconds integer default 900
)
returns table (
  reservation_id uuid,
  expires_at     timestamptz,
  status         text,
  message        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status   public.order_status;
  v_payment_method text;
  v_payment_status text;
  v_now            timestamptz := now();
  v_ttl            integer := greatest(60, least(coalesce(p_ttl_seconds, 900), 3600));
  v_existing_id    uuid;
  v_existing_exp   timestamptz;
  v_reservation_id uuid;
  v_expires_at     timestamptz;
  v_variant_id     uuid;
  v_product_id     uuid;
  v_item           record;
  v_avail          integer;
  v_owner_pid      uuid;
  v_has_variants   boolean;
  v_short          boolean := false;
  v_line_count     integer := 0;
begin
  -- Lock 1: order
  select o.status, o.payment_method, o.payment_status
    into v_order_status, v_payment_method, v_payment_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query select null::uuid, null::timestamptz, 'not_found'::text, 'Order not found'::text;
    return;
  end if;

  if v_payment_method is null or v_payment_method not in ('safepay', 'payfast') then
    return query select null::uuid, null::timestamptz, 'invalid_method'::text,
      'Only online-payment orders can reserve stock; COD is confirmed by n8n'::text;
    return;
  end if;

  if v_order_status <> 'pending'::public.order_status then
    return query select null::uuid, null::timestamptz, 'invalid_status'::text,
      ('Order status is ' || v_order_status::text || '; reservations require pending')::text;
    return;
  end if;

  if v_payment_status in ('paid', 'refunded', 'partially_refunded') then
    return query select null::uuid, null::timestamptz, 'invalid_payment_state'::text,
      'Order payment is already captured/refunded; a new hold is not allowed'::text;
    return;
  end if;

  -- A finalized reservation has already consumed the stock. Never hold twice.
  if exists (
    select 1
    from public.stock_reservations r
    where r.order_id = p_order_id
      and r.status = 'finalized'
  ) then
    return query select null::uuid, null::timestamptz, 'already_finalized'::text,
      'Order stock was already finalized; a new hold is not allowed'::text;
    return;
  end if;

  -- Lock 2: existing active reservation for this order
  select r.id, r.expires_at
    into v_existing_id, v_existing_exp
  from public.stock_reservations r
  where r.order_id = p_order_id
    and r.status = 'active'
  for update;

  if found then
    if v_existing_exp > v_now then
      return query select v_existing_id, v_existing_exp, 'active'::text,
        'Reservation already active'::text;
      return;
    end if;

    -- Expired hold: restore its stock, then create a new hold below.
    perform 1
    from public.release_order_reservation(p_order_id, 'expired_before_renewal');
  end if;

  -- Lock 3: order items in a deterministic order
  perform 1
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.id
  for update;

  -- Lock 4: variants (sorted by id), then 5: simple products (sorted by id)
  for v_variant_id in
    select distinct oi.variant_id
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
    order by oi.variant_id
  loop
    perform 1 from public.variants v where v.id = v_variant_id for update;
  end loop;

  for v_product_id in
    select distinct oi.product_id
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is null
    order by oi.product_id
  loop
    perform 1 from public.products p where p.id = v_product_id for update;
  end loop;

  -- Validate every line (mirrors public.confirm_order).
  for v_item in
    select oi.product_id, oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    v_line_count := v_line_count + 1;

    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Order % has an invalid quantity (%).', p_order_id, v_item.quantity;
    end if;

    if v_item.variant_id is not null then
      select v.product_id into v_owner_pid
      from public.variants v
      where v.id = v_item.variant_id;

      if not found then
        raise exception 'Order % references a missing variant (%).',
          p_order_id, v_item.variant_id;
      end if;
      if v_item.product_id is null or v_owner_pid is distinct from v_item.product_id then
        raise exception 'Order %: variant % does not belong to product (%).',
          p_order_id, v_item.variant_id, v_item.product_id;
      end if;
    else
      if v_item.product_id is null then
        raise exception 'Order % has a line with no product reference.', p_order_id;
      end if;

      select p.has_variants into v_has_variants
      from public.products p
      where p.id = v_item.product_id;

      if not found then
        raise exception 'Order % references a missing product (%).',
          p_order_id, v_item.product_id;
      end if;
      if v_has_variants then
        raise exception
          'Order %: product % is a variant product but the line has no variant_id.',
          p_order_id, v_item.product_id;
      end if;
    end if;
  end loop;

  if v_line_count = 0 then
    return query select null::uuid, null::timestamptz, 'no_items'::text,
      'Order has no items'::text;
    return;
  end if;

  -- Availability check across every line, before any deduction.
  for v_item in
    select oi.variant_id, sum(oi.quantity) as total_qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
    group by oi.variant_id
  loop
    select v.stock into v_avail
    from public.variants v
    where v.id = v_item.variant_id;

    if v_avail is null or v_avail < v_item.total_qty then
      v_short := true;
    end if;
  end loop;

  for v_item in
    select oi.product_id, sum(oi.quantity) as total_qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is null
    group by oi.product_id
  loop
    select p.stock into v_avail
    from public.products p
    where p.id = v_item.product_id;

    if v_avail is null or v_avail < v_item.total_qty then
      v_short := true;
    end if;
  end loop;

  if v_short then
    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'reservation_failed',
      jsonb_build_object('reason', 'insufficient stock', 'checked_at', now())
    );

    return query select null::uuid, null::timestamptz, 'insufficient_stock'::text,
      'Insufficient stock; nothing was reserved'::text;
    return;
  end if;

  -- Deduct exactly what we validated (all rows are locked).
  for v_item in
    select oi.variant_id, sum(oi.quantity) as total_qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
    group by oi.variant_id
  loop
    update public.variants v
    set stock = v.stock - v_item.total_qty
    where v.id = v_item.variant_id;
  end loop;

  for v_item in
    select oi.product_id, sum(oi.quantity) as total_qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is null
    group by oi.product_id
  loop
    update public.products p
    set stock = p.stock - v_item.total_qty
    where p.id = v_item.product_id;
  end loop;

  v_expires_at := v_now + make_interval(secs => v_ttl);

  insert into public.stock_reservations (order_id, status, expires_at)
  values (p_order_id, 'active', v_expires_at)
  returning id into v_reservation_id;

  insert into public.stock_reservation_items
    (reservation_id, product_id, variant_id, title_snapshot,
     variant_label_snapshot, quantity)
  select
    v_reservation_id,
    oi.product_id,
    oi.variant_id,
    oi.title_snapshot,
    oi.variant_label_snapshot,
    oi.quantity
  from public.order_items oi
  where oi.order_id = p_order_id;

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'stock_reserved',
    jsonb_build_object(
      'reservation_id', v_reservation_id,
      'expires_at', v_expires_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', oi.variant_id,
          'quantity', oi.quantity
        ) order by oi.variant_id nulls last)
        from public.order_items oi
        where oi.order_id = p_order_id
      ), '[]'::jsonb)
    )
  );

  return query select v_reservation_id, v_expires_at, 'reserved'::text,
    'Stock reserved'::text;
end;
$$;


-- ============================================================================
-- SECTION 6 — RPC: release_order_reservation
-- ============================================================================
-- Idempotent: only an 'active' reservation is processed. A second call (or a
-- call after expiry/finalisation) returns without touching stock.
-- The status filter plus the order/reservation row locks make double release
-- impossible. A FINALIZED reservation is never released: releasing it would
-- create phantom stock.

create or replace function public.release_order_reservation(
  p_order_id       uuid,
  p_reason         text default 'released',
  -- Optional guard used by the expiry sweep: only release THIS reservation.
  -- Without it, a sweep could release a hold that was renewed after the sweep
  -- selected its candidate.
  p_reservation_id uuid default null
)
returns table (
  released boolean,
  status   text,
  message  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res_id   uuid;
  v_res_exp  timestamptz;
  v_new_status text;
  v_variant_id uuid;
  v_product_id uuid;
begin
  -- Lock 1: order
  perform 1 from public.orders o where o.id = p_order_id for update;

  if not found then
    return query select false, 'not_found'::text, 'Order not found'::text;
    return;
  end if;

  -- Lock 2: active reservation
  select r.id, r.expires_at
    into v_res_id, v_res_exp
  from public.stock_reservations r
  where r.order_id = p_order_id
    and r.status = 'active'
  for update;

  if not found then
    if exists (
      select 1 from public.stock_reservations r
      where r.order_id = p_order_id and r.status = 'finalized'
    ) then
      return query select false, 'finalized'::text,
        'Reservation is finalized; stock was consumed and cannot be released'::text;
      return;
    end if;

    return query select true, 'no_active_reservation'::text,
      'Nothing to release (idempotent no-op)'::text;
    return;
  end if;

  -- Stale sweep candidate: a newer hold replaced the one we selected.
  if p_reservation_id is not null and v_res_id <> p_reservation_id then
    return query select true, 'no_active_reservation'::text,
      'Reservation changed since selection (idempotent no-op)'::text;
    return;
  end if;

  -- Lock 3: order items (parity with confirm_order)
  perform 1
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.id
  for update;

  -- Lock 4/5: the exact stock rows recorded in the reservation.
  for v_variant_id in
    select distinct sri.variant_id
    from public.stock_reservation_items sri
    where sri.reservation_id = v_res_id
      and sri.variant_id is not null
    order by sri.variant_id
  loop
    perform 1 from public.variants v where v.id = v_variant_id for update;
  end loop;

  for v_product_id in
    select distinct sri.product_id
    from public.stock_reservation_items sri
    where sri.reservation_id = v_res_id
      and sri.variant_id is null
      and sri.product_id is not null
    order by sri.product_id
  loop
    perform 1 from public.products p where p.id = v_product_id for update;
  end loop;

  -- Restore exactly what was deducted. FKs are RESTRICT, so referenced rows
  -- cannot have been deleted while this reservation exists.
  update public.variants v
  set stock = v.stock + agg.qty
  from (
    select sri.variant_id, sum(sri.quantity)::integer as qty
    from public.stock_reservation_items sri
    where sri.reservation_id = v_res_id
      and sri.variant_id is not null
    group by sri.variant_id
  ) agg
  where v.id = agg.variant_id;

  update public.products p
  set stock = p.stock + agg.qty
  from (
    select sri.product_id, sum(sri.quantity)::integer as qty
    from public.stock_reservation_items sri
    where sri.reservation_id = v_res_id
      and sri.variant_id is null
      and sri.product_id is not null
    group by sri.product_id
  ) agg
  where p.id = agg.product_id
    and p.stock is not null;

  v_new_status := case
    when p_reason in ('expired', 'expired_before_renewal', 'expired_at_payment')
      or v_res_exp <= now()
    then 'expired'
    else 'released'
  end;

  update public.stock_reservations r
  set status = v_new_status,
      released_at = now(),
      release_reason = p_reason
  where r.id = v_res_id
    and r.status = 'active';

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'stock_released',
    jsonb_build_object(
      'reservation_id', v_res_id,
      'reason', p_reason,
      'status', v_new_status,
      'released_at', now(),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', sri.product_id,
          'variant_id', sri.variant_id,
          'quantity', sri.quantity
        ))
        from public.stock_reservation_items sri
        where sri.reservation_id = v_res_id
      ), '[]'::jsonb)
    )
  );

  return query select true, v_new_status, 'Reservation released'::text;
end;
$$;


-- ============================================================================
-- SECTION 7 — RPC: expire_stale_reservations
-- ============================================================================
-- Safe to call concurrently: each candidate is released by
-- release_order_reservation, which locks the order and re-checks 'active'.
-- A second worker that picked the same order becomes a no-op.

create or replace function public.expire_stale_reservations(
  p_limit integer default 100
)
returns table (
  expired_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_order_id uuid;
  v_res_id   uuid;
  v_count integer := 0;
  v_result record;
begin
  for v_res_id, v_order_id in
    select r.id, r.order_id
    from public.stock_reservations r
    where r.status = 'active'
      and r.expires_at <= now()
    order by r.expires_at
    limit v_limit
  loop
    select * into v_result
    from public.release_order_reservation(v_order_id, 'expired', v_res_id);

    if v_result.released and v_result.status = 'expired' then
      v_count := v_count + 1;

      -- Mark the payment attempt as expired, but leave fulfilment status
      -- untouched so an admin can still cancel a pending order explicitly.
      perform set_config('atlas.allow_payment_write', 'on', true);
      update public.orders o
      set payment_status = 'expired'
      where o.id = v_order_id
        and o.payment_status = 'pending';
    end if;
  end loop;

  return query select v_count;
end;
$$;


-- ============================================================================
-- SECTION 8 — RPC: record_verified_payment
-- ============================================================================
-- The ONLY place (besides finalize_paid_order) allowed to set payment_status
-- to 'paid'. Intended to be called by the webhook Route Handler after:
--   1. the raw body signature has been verified, and
--   2. the provider has been queried server-to-server (or the signed webhook
--      payload has been accepted as authoritative).
-- The amount and currency are compared with orders.total/payment_currency
-- inside the transaction; a mismatch records nothing and returns ok = false.
-- Idempotent on (gateway, environment, provider_transaction_id).

create or replace function public.record_verified_payment(
  p_order_id                uuid,
  p_gateway                 text,
  p_environment             text,
  p_provider_transaction_id text,
  p_amount                  numeric,
  p_currency                text,
  p_payload                 jsonb default '{}'::jsonb
)
returns table (
  ok             boolean,
  transaction_id uuid,
  payment_status text,
  message        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order          record;
  v_tx             record;
  v_tx_id          uuid;
  v_payment_status text;
begin
  -- Lock 1: order
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query select false, null::uuid, null::text, 'Order not found'::text;
    return;
  end if;

  if v_order.payment_method = 'cod' then
    return query select false, null::uuid, v_order.payment_status,
      'COD orders cannot be marked paid through an online gateway'::text;
    return;
  end if;

  if p_gateway is null or p_gateway <> v_order.payment_method then
    return query select false, null::uuid, v_order.payment_status,
      'Gateway does not match the order payment_method'::text;
    return;
  end if;

  if p_environment is null or p_environment not in ('sandbox', 'live') then
    return query select false, null::uuid, v_order.payment_status,
      'Environment must be sandbox or live'::text;
    return;
  end if;

  if p_provider_transaction_id is null
     or btrim(p_provider_transaction_id) = '' then
    return query select false, null::uuid, v_order.payment_status,
      'Provider transaction id is required'::text;
    return;
  end if;

  -- Exact money check; never trust the browser or an unverified callback.
  if p_amount is null or p_amount <> v_order.total then
    return query select false, null::uuid, v_order.payment_status,
      'Amount does not match the order total'::text;
    return;
  end if;

  if upper(coalesce(p_currency, '')) <> upper(coalesce(v_order.payment_currency, 'PKR')) then
    return query select false, null::uuid, v_order.payment_status,
      'Currency does not match the order currency'::text;
    return;
  end if;

  if v_order.payment_status in ('refunded', 'partially_refunded') then
    return query select false, null::uuid, v_order.payment_status,
      'Order is already refunded; a capture cannot be applied'::text;
    return;
  end if;

  -- NOTE: a cancelled order is deliberately NOT rejected here. If the provider
  -- captured money after an admin cancelled the order, the ledger entry and
  -- paid flag must still exist for reconciliation/refund. finalize_paid_order()
  -- classifies it as order_not_pending and releases any hold.

  -- Idempotency: same provider transaction id.
  select t.* into v_tx
  from public.payment_transactions t
  where t.gateway = p_gateway
    and t.environment = p_environment
    and t.provider_transaction_id = btrim(p_provider_transaction_id);

  if found then
    -- Validate the ENTIRE existing row, not just its order id. A matching
    -- provider id that points at another gateway/environment/order, or that
    -- is not succeeded, can never mark this order paid.
    if v_tx.order_id is distinct from p_order_id
       or v_tx.gateway is distinct from p_gateway
       or v_tx.environment is distinct from p_environment
       or v_tx.provider_transaction_id is distinct from btrim(p_provider_transaction_id)
    then
      return query select false, null::uuid, v_order.payment_status,
        'Provider transaction does not match this order, gateway and environment'::text;
      return;
    end if;

    if v_tx.status <> 'succeeded' then
      return query select false, v_tx.id, v_order.payment_status,
        ('Provider transaction is ' || v_tx.status || ', not succeeded')::text;
      return;
    end if;

    if v_tx.amount is distinct from p_amount
       or upper(coalesce(v_tx.currency, '')) <> upper(coalesce(p_currency, ''))
    then
      return query select false, v_tx.id, v_order.payment_status,
        'Provider transaction amount or currency does not match the order'::text;
      return;
    end if;

    if v_order.payment_status = 'paid' then
      -- Idempotent only when the order's stored capture metadata agrees with
      -- the verified provider row and this callback.
      if v_order.payment_gateway is distinct from p_gateway
         or v_order.payment_amount is distinct from p_amount
         or upper(coalesce(v_order.payment_currency, '')) <> upper(coalesce(p_currency, ''))
      then
        return query select false, v_tx.id, v_order.payment_status,
          'Order is paid but its payment metadata does not match this transaction; reconcile manually'::text;
        return;
      end if;

      return query select true, v_tx.id, 'paid'::text,
        'Payment already recorded (idempotent)'::text;
      return;
    end if;

    -- Repair a partially applied paid flag on an existing succeeded ledger row.
    perform set_config('atlas.allow_payment_write', 'on', true);
    update public.orders o
    set payment_status   = 'paid',
        payment_gateway  = p_gateway,
        payment_amount   = p_amount,
        payment_currency = upper(p_currency),
        paid_at          = coalesce(o.paid_at, now())
    where o.id = p_order_id;

    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'payment_captured',
      jsonb_build_object(
        'gateway', p_gateway,
        'environment', p_environment,
        'provider_transaction_id', btrim(p_provider_transaction_id),
        'amount', p_amount,
        'currency', upper(p_currency),
        'transaction_id', v_tx.id,
        'reconciled_existing_transaction', true,
        'recorded_at', now()
      )
    );

    return query select true, v_tx.id, 'paid'::text,
      'Existing transaction applied to the order'::text;
    return;
  end if;

  -- A second, different provider transaction must not silently overwrite a
  -- paid order's metadata. That is a double-charge/reconciliation case.
  if v_order.payment_status = 'paid' then
    return query select false, null::uuid, v_order.payment_status,
      'Order is already paid by a different provider transaction; reconcile or refund instead'::text;
    return;
  end if;

  insert into public.payment_transactions
    (order_id, gateway, environment, provider_transaction_id, status,
     amount, currency, payload)
  values
    (p_order_id, p_gateway, p_environment, btrim(p_provider_transaction_id),
     'succeeded', p_amount, upper(p_currency), coalesce(p_payload, '{}'::jsonb))
  on conflict (gateway, environment, provider_transaction_id) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    -- Concurrent insert won the race; re-read and validate the same fields as
    -- the pre-check. Never adopt an unverified row just because the id matched.
    select t.* into v_tx
    from public.payment_transactions t
    where t.gateway = p_gateway
      and t.environment = p_environment
      and t.provider_transaction_id = btrim(p_provider_transaction_id);

    if not found then
      return query select false, null::uuid, v_order.payment_status,
        'Concurrent transaction could not be re-read'::text;
      return;
    end if;

    if v_tx.order_id is distinct from p_order_id
       or v_tx.gateway is distinct from p_gateway
       or v_tx.environment is distinct from p_environment
       or v_tx.provider_transaction_id is distinct from btrim(p_provider_transaction_id)
    then
      return query select false, v_tx.id, v_order.payment_status,
        'Conflicting transaction for this provider id'::text;
      return;
    end if;

    if v_tx.status <> 'succeeded' then
      return query select false, v_tx.id, v_order.payment_status,
        ('Concurrent provider transaction is ' || v_tx.status || ', not succeeded')::text;
      return;
    end if;

    if v_tx.amount is distinct from p_amount
       or upper(coalesce(v_tx.currency, '')) <> upper(coalesce(p_currency, ''))
    then
      return query select false, v_tx.id, v_order.payment_status,
        'Concurrent transaction amount or currency does not match the order'::text;
      return;
    end if;

    v_tx_id := v_tx.id;
  end if;

  perform set_config('atlas.allow_payment_write', 'on', true);

  update public.orders o
  set payment_status   = 'paid',
      payment_gateway  = p_gateway,
      payment_amount   = p_amount,
      payment_currency = upper(p_currency),
      paid_at          = coalesce(o.paid_at, now())
  where o.id = p_order_id;

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'payment_captured',
    jsonb_build_object(
      'gateway', p_gateway,
      'environment', p_environment,
      'provider_transaction_id', btrim(p_provider_transaction_id),
      'amount', p_amount,
      'currency', upper(p_currency),
      'transaction_id', v_tx_id,
      'recorded_at', now()
    )
  );

  select o.payment_status into v_payment_status
  from public.orders o
  where o.id = p_order_id;

  return query select true, v_tx_id, v_payment_status, 'Payment recorded'::text;
end;
$$;


-- ============================================================================
-- SECTION 9 — RPC: finalize_paid_order
-- ============================================================================
-- The webhook entry point. Records the verified payment, consumes the active
-- reservation WITHOUT any further stock deduction, and confirms the order.
--
-- Why no deduction here: reserve_order_stock already decremented stock. This is
-- the single guarantee that an online order never deducts twice.
--
-- Order is confirmed only from 'pending'. The confirmation guard trigger is
-- satisfied by setting atlas.allow_paid_confirmation for this transaction.
--
-- If the hold expired (late webhook), the payment is still recorded (the money
-- was really taken) and the order moves to out_of_stock for refund/handling;
-- ok = false and message = 'reservation_expired'.

create or replace function public.finalize_paid_order(
  p_order_id                uuid,
  p_gateway                 text,
  p_environment             text,
  p_provider_transaction_id text,
  p_amount                  numeric,
  p_currency                text,
  p_payload                 jsonb default '{}'::jsonb
)
returns table (
  ok             boolean,
  order_id       uuid,
  payment_status text,
  order_status   text,
  message        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment      record;
  v_res_id       uuid;
  v_res_exp      timestamptz;
  v_status       public.order_status;
  v_final_status text;
  v_tx_id        uuid;
begin
  -- Lock 1: order (record_verified_payment re-locks it in the same transaction)
  perform 1 from public.orders o where o.id = p_order_id for update;

  if not found then
    return query select false, p_order_id, null::text, null::text, 'Order not found'::text;
    return;
  end if;

  -- Lock 2: active reservation (before recording payment, so a late webhook
  -- can be classified deterministically).
  select r.id, r.expires_at
    into v_res_id, v_res_exp
  from public.stock_reservations r
  where r.order_id = p_order_id
    and r.status = 'active'
  for update;

  if found and v_res_exp <= now() then
    -- Release inside this transaction; payment below is still recorded.
    perform 1
    from public.release_order_reservation(p_order_id, 'expired_at_payment');
    v_res_id := null;

    -- The hold is gone. Mark the attempt expired so a failed capture below
    -- cannot leave the order in a misleading 'pending' state; a successful
    -- capture can still move expired -> paid through record_verified_payment.
    perform set_config('atlas.allow_payment_write', 'on', true);
    update public.orders o
    set payment_status = 'expired'
    where o.id = p_order_id
      and o.payment_status = 'pending';
  end if;

  select * into v_payment
  from public.record_verified_payment(
    p_order_id,
    p_gateway,
    p_environment,
    p_provider_transaction_id,
    p_amount,
    p_currency,
    p_payload
  );

  if not v_payment.ok then
    select o.status, o.payment_status into v_status, v_final_status
    from public.orders o where o.id = p_order_id;

    return query select false, p_order_id, v_final_status, v_status::text,
      v_payment.message;
    return;
  end if;

  v_tx_id := v_payment.transaction_id;

  -- Payment is recorded, but is the order still confirmable? An admin may have
  -- set out_of_stock/cancelled while the customer was paying. In that case the
  -- hold must be released (never left stranded) and the payment is surfaced for
  -- refund/reconciliation.
  select o.status into v_status
  from public.orders o where o.id = p_order_id;

  if v_status not in ('pending'::public.order_status, 'confirmed'::public.order_status) then
    if v_res_id is not null then
      perform 1
      from public.release_order_reservation(p_order_id, 'order_not_pending');
    end if;

    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'payment_captured_order_not_confirmable',
      jsonb_build_object(
        'reason', 'order status is ' || v_status::text,
        'transaction_id', v_tx_id,
        'recorded_at', now()
      )
    );

    select o.status, o.payment_status into v_status, v_final_status
    from public.orders o where o.id = p_order_id;

    return query select false, p_order_id, v_final_status, v_status::text,
      'order_not_pending'::text;
    return;
  end if;

  -- Already finalized: idempotent success.
  if v_res_id is null then
    if exists (
      select 1 from public.stock_reservations r
      where r.order_id = p_order_id and r.status = 'finalized'
    ) then
      select o.status, o.payment_status into v_status, v_final_status
      from public.orders o where o.id = p_order_id;

      return query select true, p_order_id, v_final_status, v_status::text,
        'Already finalized (idempotent)'::text;
      return;
    end if;

    -- Payment captured after the hold was released/expired.
    update public.orders o
    set status = 'out_of_stock'::public.order_status
    where o.id = p_order_id
      and o.status = 'pending'::public.order_status;

    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'payment_captured_stock_unavailable',
      jsonb_build_object(
        'reason', 'reservation expired or released before payment verification',
        'transaction_id', v_tx_id,
        'recorded_at', now()
      )
    );

    select o.status, o.payment_status into v_status, v_final_status
    from public.orders o where o.id = p_order_id;

    return query select false, p_order_id, v_final_status, v_status::text,
      'reservation_expired'::text;
    return;
  end if;

  -- Consume the hold. Stock was already deducted in reserve_order_stock.
  update public.stock_reservations r
  set status = 'finalized',
      finalized_at = now()
  where r.id = v_res_id
    and r.status = 'active';

  if not found then
    -- Raced with an expiry/release between our lock and this update.
    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'payment_captured_stock_unavailable',
      jsonb_build_object('reason', 'reservation changed concurrently',
                         'transaction_id', v_tx_id, 'recorded_at', now())
    );

    update public.orders o
    set status = 'out_of_stock'::public.order_status
    where o.id = p_order_id
      and o.status = 'pending'::public.order_status;

    select o.status, o.payment_status into v_status, v_final_status
    from public.orders o where o.id = p_order_id;

    return query select false, p_order_id, v_final_status, v_status::text,
      'reservation_changed'::text;
    return;
  end if;

  -- Confirm without deducting. COD orders can never reach this branch.
  perform set_config('atlas.allow_paid_confirmation', 'on', true);

  update public.orders o
  set status = 'confirmed'::public.order_status
  where o.id = p_order_id
    and o.status = 'pending'::public.order_status;

  -- Mirror the audit row public.confirm_order writes, so the existing admin
  -- guards (which look for event = 'confirmed') behave identically.
  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'confirmed',
    jsonb_build_object(
      'confirmed_at', now(),
      'via', 'safepay_verified_payment',
      'transaction_id', v_tx_id,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', oi.variant_id,
          'quantity', oi.quantity
        ) order by oi.variant_id nulls last)
        from public.order_items oi
        where oi.order_id = p_order_id
      ), '[]'::jsonb)
    )
  );

  select o.status, o.payment_status into v_status, v_final_status
  from public.orders o where o.id = p_order_id;

  return query select true, p_order_id, v_final_status, v_status::text,
    'Order paid and confirmed'::text;
end;
$$;


-- ============================================================================
-- SECTION 10 — RPC: fail_order_payment
-- ============================================================================
-- Records a failed/cancelled provider attempt and releases the hold atomically.
-- Safe to call repeatedly; a paid order can never be downgraded.

create or replace function public.fail_order_payment(
  p_order_id                uuid,
  p_gateway                 text,
  p_environment             text,
  p_provider_transaction_id text,
  p_outcome                 text default 'failed',   -- failed | cancelled
  p_payload                 jsonb default '{}'::jsonb
)
returns table (
  ok             boolean,
  payment_status text,
  message        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order       record;
  v_status      text;
  v_tx_status   text;
  v_tx_order_id uuid;
  v_tx_amount   numeric(10,2);
  v_tx_currency text;
  v_provider    text := btrim(coalesce(p_provider_transaction_id, ''));
begin
  if p_outcome not in ('failed', 'cancelled') then
    return query select false, null::text, 'Outcome must be failed or cancelled'::text;
    return;
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query select false, null::text, 'Order not found'::text;
    return;
  end if;

  if v_order.payment_method = 'cod' then
    return query select false, v_order.payment_status,
      'COD orders are not processed by online gateway functions'::text;
    return;
  end if;

  if p_gateway is null or p_gateway <> v_order.payment_method then
    return query select false, v_order.payment_status,
      'Gateway does not match the order payment_method'::text;
    return;
  end if;

  if p_environment is null or p_environment not in ('sandbox', 'live') then
    return query select false, v_order.payment_status,
      'Environment must be sandbox or live'::text;
    return;
  end if;

  if v_provider = '' then
    return query select false, v_order.payment_status,
      'Provider transaction id is required'::text;
    return;
  end if;

  if v_order.payment_status = 'paid' then
    return query select false, v_order.payment_status,
      'Order is already paid; use the refund path instead'::text;
    return;
  end if;

  if v_order.payment_status in ('refunded', 'partially_refunded') then
    return query select false, v_order.payment_status,
      'Order is already refunded; a failure callback cannot change it'::text;
    return;
  end if;

  -- Only failure-eligible states may receive a failure ledger row. This also
  -- rejects legacy online orders stuck at the COD-only 'not_required' value.
  if v_order.payment_status not in ('unpaid', 'pending', 'failed', 'cancelled', 'expired') then
    return query select false, v_order.payment_status,
      ('Order payment status is ' || v_order.payment_status || '; failure is not applicable')::text;
    return;
  end if;

  insert into public.payment_transactions
    (order_id, gateway, environment, provider_transaction_id, status,
     amount, currency, payload)
  values
    (p_order_id, p_gateway, p_environment, v_provider,
     p_outcome, coalesce(v_order.total, 0),
     coalesce(v_order.payment_currency, 'PKR'),
     coalesce(p_payload, '{}'::jsonb))
  on conflict (gateway, environment, provider_transaction_id) do nothing;

  -- Re-read the exact ledger row and validate all identity fields. A late
  -- failure callback must never touch a succeeded transaction, even if that
  -- transaction belongs to another order.
  select t.status, t.order_id, t.amount, t.currency
    into v_tx_status, v_tx_order_id, v_tx_amount, v_tx_currency
  from public.payment_transactions t
  where t.gateway = p_gateway
    and t.environment = p_environment
    and t.provider_transaction_id = v_provider;

  if v_tx_status is null then
    return query select false, v_order.payment_status,
      'Provider transaction could not be recorded'::text;
    return;
  end if;

  if v_tx_order_id <> p_order_id then
    return query select false, v_order.payment_status,
      'Provider transaction belongs to another order'::text;
    return;
  end if;

  -- A failure callback for a mismatched amount/currency must not release the
  -- reservation or touch the order.
  if v_tx_amount is distinct from v_order.total then
    return query select false, v_order.payment_status,
      'Provider transaction amount does not match the order total'::text;
    return;
  end if;

  if upper(coalesce(v_tx_currency, '')) <> upper(coalesce(v_order.payment_currency, 'PKR')) then
    return query select false, v_order.payment_status,
      'Provider transaction currency does not match the order currency'::text;
    return;
  end if;

  if v_tx_status = 'succeeded' then
    return query select false, v_order.payment_status,
      'Provider transaction already succeeded'::text;
    return;
  end if;

  if v_tx_status <> p_outcome then
    return query select false, v_order.payment_status,
      ('Provider transaction is already recorded as ' || v_tx_status)::text;
    return;
  end if;

  perform set_config('atlas.allow_payment_write', 'on', true);

  update public.orders o
  set payment_status = p_outcome
  where o.id = p_order_id
    and o.payment_status in ('unpaid', 'pending', 'failed', 'cancelled', 'expired');

  if not found then
    return query select false, v_order.payment_status,
      'Order payment status changed; failure was not applied'::text;
    return;
  end if;

  -- Release only after the order transition actually applied. If the release
  -- fails, the whole transaction (including the update and ledger row) rolls back.
  perform 1
  from public.release_order_reservation(p_order_id, p_outcome);

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'payment_failed',
    jsonb_build_object(
      'gateway', p_gateway,
      'environment', p_environment,
      'outcome', p_outcome,
      'provider_transaction_id', v_provider,
      'recorded_at', now()
    )
  );

  select o.payment_status into v_status
  from public.orders o where o.id = p_order_id;

  return query select true, v_status, ('Payment marked ' || p_outcome)::text;
end;
$$;


-- ============================================================================
-- SECTION 10.5 — RPC: record_verified_refund
-- ============================================================================
-- Records a refund that has ALREADY been confirmed by the provider
-- server-to-server. This is the only path allowed to move a paid order to
-- partially_refunded/refunded (the guard trigger requires the trusted flag).
-- It never calls the provider and never restocks; those remain application
-- concerns. Idempotent on (gateway, environment, provider_refund_id), but a
-- repeated id with a different order/transaction/gateway/environment/amount/
-- currency is rejected. The provider ledger is insert-only; refund state lives
-- in payment_refunds.

create or replace function public.record_verified_refund(
  p_order_id           uuid,
  p_gateway            text,
  p_environment        text,
  p_provider_refund_id text,
  p_amount             numeric,
  p_currency           text,
  p_reason             text default null,
  p_payload            jsonb default '{}'::jsonb
)
returns table (
  ok             boolean,
  refund_id      uuid,
  payment_status text,
  message        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      record;
  v_tx         record;
  v_ref        record;
  v_refunded   numeric(10,2) := 0;
  v_total      numeric(10,2);
  v_provider   text := btrim(coalesce(p_provider_refund_id, ''));
  v_new_status text;
  v_refund_id  uuid;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query select false, null::uuid, null::text, 'Order not found'::text;
    return;
  end if;

  if v_order.payment_method = 'cod' then
    return query select false, null::uuid, v_order.payment_status,
      'COD orders have no online refunds'::text;
    return;
  end if;

  if p_gateway is null or p_gateway <> v_order.payment_method then
    return query select false, null::uuid, v_order.payment_status,
      'Gateway does not match the order payment_method'::text;
    return;
  end if;

  if p_environment is null or p_environment not in ('sandbox', 'live') then
    return query select false, null::uuid, v_order.payment_status,
      'Environment must be sandbox or live'::text;
    return;
  end if;

  if v_provider = '' then
    return query select false, null::uuid, v_order.payment_status,
      'Provider refund id is required'::text;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, null::uuid, v_order.payment_status,
      'Refund amount must be greater than zero'::text;
    return;
  end if;

  if upper(coalesce(p_currency, '')) <> upper(coalesce(v_order.payment_currency, 'PKR')) then
    return query select false, null::uuid, v_order.payment_status,
      'Currency does not match the order currency'::text;
    return;
  end if;

  -- Idempotency lookup BEFORE the refundable-state check: a retried callback
  -- for the final refund arrives after the order has already become 'refunded'.
  select r.* into v_ref
  from public.payment_refunds r
  where r.gateway = p_gateway
    and r.environment = p_environment
    and r.provider_refund_id = v_provider;

  if found then
    if v_ref.order_id is distinct from p_order_id
       or v_ref.gateway is distinct from p_gateway
       or v_ref.environment is distinct from p_environment
       or v_ref.amount is distinct from p_amount
       or upper(coalesce(v_ref.currency, '')) <> upper(coalesce(p_currency, ''))
    then
      return query select false, v_ref.id, v_order.payment_status,
        'Provider refund id is already used with different details (order, gateway, environment, amount or currency)'::text;
      return;
    end if;

    if v_ref.status <> 'succeeded' then
      return query select false, v_ref.id, v_order.payment_status,
        ('Provider refund id already exists with status ' || v_ref.status)::text;
      return;
    end if;

    -- The stored refund must still point at a capture that belongs to this
    -- order/gateway/environment; never return success for a detached refund.
    select t.* into v_tx
    from public.payment_transactions t
    where t.id = v_ref.transaction_id;

    if not found
       or v_tx.order_id is distinct from p_order_id
       or v_tx.gateway is distinct from p_gateway
       or v_tx.environment is distinct from p_environment
       or v_tx.status <> 'succeeded'
    then
      return query select false, v_ref.id, v_order.payment_status,
        'Refund transaction association is invalid'::text;
      return;
    end if;

    if upper(coalesce(v_tx.currency, '')) <> upper(coalesce(v_order.payment_currency, 'PKR'))
       or (v_order.payment_amount is not null
           and v_tx.amount is distinct from v_order.payment_amount)
    then
      return query select false, v_ref.id, v_order.payment_status,
        'Refund transaction amount/currency does not match the order'::text;
      return;
    end if;

    return query select true, v_ref.id, v_order.payment_status,
      'Refund already recorded (idempotent)'::text;
    return;
  end if;

  -- A new refund may only move a paid/partially refunded order forward.
  if v_order.payment_status not in ('paid', 'partially_refunded') then
    return query select false, null::uuid, v_order.payment_status,
      'Order is not in a refundable payment state'::text;
    return;
  end if;

  select t.* into v_tx
  from public.payment_transactions t
  where t.order_id = p_order_id
    and t.gateway = p_gateway
    and t.environment = p_environment
    and t.status = 'succeeded'
  order by t.created_at desc
  limit 1;

  if not found then
    return query select false, null::uuid, v_order.payment_status,
      'No succeeded payment transaction for this gateway/environment'::text;
    return;
  end if;

  if upper(coalesce(v_tx.currency, '')) <> upper(coalesce(v_order.payment_currency, 'PKR')) then
    return query select false, null::uuid, v_order.payment_status,
      'Ledger currency does not match the order currency'::text;
    return;
  end if;

  if v_order.payment_amount is not null
     and v_tx.amount is distinct from v_order.payment_amount
  then
    return query select false, null::uuid, v_order.payment_status,
      'Ledger amount does not match the captured order amount'::text;
    return;
  end if;

  v_total := coalesce(v_order.payment_amount, v_tx.amount);

  select coalesce(sum(r.amount), 0) into v_refunded
  from public.payment_refunds r
  where r.order_id = p_order_id
    and r.status = 'succeeded';

  if p_amount + v_refunded > v_total then
    return query select false, null::uuid, v_order.payment_status,
      'Refund would exceed the captured amount'::text;
    return;
  end if;

  insert into public.payment_refunds
    (order_id, transaction_id, gateway, environment, provider_refund_id,
     amount, currency, status, reason, provider_payload, created_by)
  values
    (p_order_id, v_tx.id, p_gateway, p_environment, v_provider,
     p_amount, upper(p_currency), 'succeeded', p_reason,
     coalesce(p_payload, '{}'::jsonb), 'verified_refund')
  returning id into v_refund_id;

  v_new_status := case
    when p_amount + v_refunded >= v_total then 'refunded'
    else 'partially_refunded'
  end;

  perform set_config('atlas.allow_payment_write', 'on', true);

  update public.orders o
  set payment_status = v_new_status
  where o.id = p_order_id;

  -- The provider ledger is insert-only: no refund status is written back.
  -- Refund state is derived from public.payment_refunds (and the order's
  -- payment_status), so a captured transaction row is never mutated.

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'payment_refunded',
    jsonb_build_object(
      'gateway', p_gateway,
      'environment', p_environment,
      'provider_refund_id', v_provider,
      'amount', p_amount,
      'currency', upper(p_currency),
      'total_refunded', p_amount + v_refunded,
      'payment_status', v_new_status,
      'recorded_at', now()
    )
  );

  return query select true, v_refund_id, v_new_status, 'Refund recorded'::text;
end;
$$;


-- ============================================================================
-- SECTION 11 — RPCs: webhook inbox (claim / retry / complete)
-- ============================================================================
-- claim_payment_webhook atomically inserts-or-claims. It returns claimed = true
-- only for a new event, a FAILED event whose backoff elapsed, or a 'processing'
-- event whose lease expired. 'processed'/'ignored' events and freshly leased
-- 'processing' events return claimed = false.
-- The returned lock_token must be passed to mark_payment_webhook_processed, so
-- a stale worker can never complete an event that a newer worker reclaimed.
-- This makes a duplicate delivery a retry opportunity, not an automatic skip.

create or replace function public.claim_payment_webhook(
  p_gateway           text,
  p_provider_event_id text,
  p_event_type        text,
  p_payload           jsonb default '{}'::jsonb,
  p_lease_seconds     integer default 300
)
returns table (
  event_id          uuid,
  claimed           boolean,
  processing_status text,
  attempts          integer,
  lock_token        uuid,
  message           text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_token    uuid := gen_random_uuid();
  v_status   text;
  v_attempts integer;
  v_lease    integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
  v_event_id text := btrim(coalesce(p_provider_event_id, ''));
begin
  if p_gateway is null or p_gateway not in ('safepay', 'payfast') then
    raise exception 'Unsupported gateway: %', p_gateway using errcode = 'check_violation';
  end if;
  if v_event_id = '' then
    raise exception 'provider_event_id is required' using errcode = 'check_violation';
  end if;

  -- New event: insert already in 'processing' with the lease held. Insert and
  -- claim in one statement closes the window where two workers could both
  -- believe they own a freshly inserted row.
  insert into public.payment_webhook_events
    (gateway, provider_event_id, event_type, payload, processing_status,
     attempts, locked_at, lock_token, next_attempt_at)
  values
    (p_gateway, v_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb),
     'processing', 1, now(), v_token,
     now() + make_interval(secs => v_lease))
  on conflict (gateway, provider_event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true, 'processing'::text, 1, v_token,
      'Claimed new event'::text;
    return;
  end if;

  -- Existing event: claim only when it is retryable or its lease is abandoned.
  update public.payment_webhook_events e
  set processing_status = 'processing',
      attempts          = e.attempts + 1,
      locked_at         = now(),
      lock_token        = v_token,
      next_attempt_at   = now() + make_interval(secs => v_lease),
      last_error        = null,
      processed_at      = null
  where e.gateway = p_gateway
    and e.provider_event_id = v_event_id
    and (
      e.processing_status = 'received'
      or (e.processing_status = 'failed'
          and coalesce(e.next_attempt_at, now()) <= now())
      or (e.processing_status = 'processing'
          and (e.locked_at is null
               or e.locked_at < now() - make_interval(secs => v_lease)))
    )
  returning e.id, e.processing_status, e.attempts
    into v_id, v_status, v_attempts;

  if v_id is not null then
    return query select v_id, true, v_status, v_attempts, v_token,
      'Claimed for retry'::text;
    return;
  end if;

  select e.id, e.processing_status, e.attempts
    into v_id, v_status, v_attempts
  from public.payment_webhook_events e
  where e.gateway = p_gateway
    and e.provider_event_id = v_event_id;

  return query select v_id, false, v_status, v_attempts, null::uuid,
    case
      when v_status = 'processed' then 'Already processed; skip'::text
      when v_status = 'ignored'   then 'Ignored; skip'::text
      when v_status = 'failed'    then 'Failed; retry backoff has not elapsed'::text
      else 'Currently processing under an active lease'::text
    end;
end;
$$;

create or replace function public.mark_payment_webhook_processed(
  p_event_id   uuid,
  p_lock_token uuid,
  p_status     text,
  p_error      text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'Invalid webhook completion status: %', p_status
      using errcode = 'check_violation';
  end if;

  update public.payment_webhook_events e
  set processing_status = p_status,
      processed_at      = case
        when p_status in ('processed', 'ignored') then now()
        else null
      end,
      last_error        = p_error,
      locked_at         = null,
      lock_token        = null,
      next_attempt_at   = case
        when p_status = 'failed'
          then now() + make_interval(secs => least(3600, 30 * greatest(e.attempts, 1)))
        else null
      end
  where e.id = p_event_id
    and e.processing_status = 'processing'
    and e.lock_token = p_lock_token;

  v_found := found;
  return v_found;
end;
$$;


-- ============================================================================
-- SECTION 12 — Row Level Security and privileges
-- ============================================================================
-- Every new table is service-role only. There are NO policies for anon or
-- authenticated: RLS denies by default, and table privileges are revoked for
-- defence in depth. Customers read their own payment status through the
-- existing "read own orders" policy on public.orders (the new columns are part
-- of that row); they never read transactions, reservations or webhooks.

alter table public.stock_reservations        enable row level security;
alter table public.stock_reservation_items   enable row level security;
alter table public.payment_transactions      enable row level security;
alter table public.payment_webhook_events    enable row level security;
alter table public.payment_refunds           enable row level security;

revoke all on table public.stock_reservations      from anon, authenticated;
revoke all on table public.stock_reservation_items from anon, authenticated;
revoke all on table public.payment_transactions    from anon, authenticated;
revoke all on table public.payment_webhook_events  from anon, authenticated;
revoke all on table public.payment_refunds         from anon, authenticated;

grant select, insert, update, delete
  on table public.stock_reservations,
           public.stock_reservation_items,
           public.payment_webhook_events,
           public.payment_refunds
  to service_role;

-- The provider ledger is insert-only at the privilege layer too: service_role
-- may read and append capture/failure rows, but never rewrite or delete them.
-- (The table owner/postgres can still perform maintenance.)
grant select, insert on table public.payment_transactions to service_role;
revoke update, delete on table public.payment_transactions from service_role;

-- Trigger functions are executed by the trigger machinery, never by clients.
-- Revoke the default PUBLIC EXECUTE explicitly.
revoke execute on function public.guard_order_payment_state()
  from public, anon, authenticated;
revoke execute on function public.prevent_reserved_stock_delete()
  from public, anon, authenticated;

-- RPC execute grants: service_role only. `public` is revoked explicitly too,
-- because PostgreSQL grants EXECUTE to PUBLIC by default on new functions.

revoke execute on function public.reserve_order_stock(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid, integer)
  to service_role;

revoke execute on function public.release_order_reservation(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_order_reservation(uuid, text, uuid)
  to service_role;

revoke execute on function public.expire_stale_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_reservations(integer)
  to service_role;

revoke execute on function public.record_verified_payment(uuid, text, text, text, numeric, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_verified_payment(uuid, text, text, text, numeric, text, jsonb)
  to service_role;

revoke execute on function public.finalize_paid_order(uuid, text, text, text, numeric, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text, text, text, numeric, text, jsonb)
  to service_role;

revoke execute on function public.fail_order_payment(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fail_order_payment(uuid, text, text, text, text, jsonb)
  to service_role;

revoke execute on function public.claim_payment_webhook(text, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.claim_payment_webhook(text, text, text, jsonb, integer)
  to service_role;

revoke execute on function public.mark_payment_webhook_processed(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_webhook_processed(uuid, uuid, text, text)
  to service_role;

revoke execute on function public.record_verified_refund(uuid, text, text, text, numeric, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_verified_refund(uuid, text, text, text, numeric, text, text, jsonb)
  to service_role;


-- ============================================================================
-- SECTION 13 — Reservation expiry scheduling
-- ============================================================================
-- pg_cron is AVAILABLE on Supabase but is NOT guaranteed to be enabled, and it
-- cannot be verified from the application. Choose ONE of the following.
--
-- OPTION 1 — pg_cron (only after confirming `select * from pg_extension where
-- extname = 'pg_cron';` returns a row; otherwise enable it in
-- Dashboard → Database → Extensions first):
--
--   select cron.schedule(
--     'atlas-expire-stock-reservations',
--     '* * * * *',                                  -- every minute
--     $$select public.expire_stale_reservations(200);$$
--   );
--
--   -- Inspect:
--   select * from cron.job where jobname = 'atlas-expire-stock-reservations';
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job
--                    where jobname = 'atlas-expire-stock-reservations')
--    order by start_time desc limit 10;
--
-- OPTION 2 — Vercel Cron (no extension required). Add a Route Handler
-- (application change, not part of this proposal) that checks
-- `Authorization: Bearer $CRON_SECRET`, calls
-- `createAdminClient().rpc('expire_stale_reservations', { p_limit: 200 })`
-- and returns 200. Then in vercel.json:
--
--   { "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }] }
--
-- OPTION 3 — Manual/admin trigger: an admin-only server action can call the
-- same RPC on demand. Not sufficient on its own; use with Option 1 or 2.
--
-- Regardless of scheduler, lazy expiry inside reserve_order_stock and
-- finalize_paid_order guarantees that a specific order is never reserved twice
-- or finalised on a stale hold.


-- ============================================================================
-- SECTION 14 — Safe rollback (manual, destructive, never silent)
-- ============================================================================
-- Rollback is a human decision. This section refuses to run while stock is
-- held, refuses to drop payment history unless an explicit destructive flag is
-- set, and archives the ledger before columns are removed.
--
-- The guard below is created by the proposal (it does nothing at apply time),
-- and MUST be called before STEP 5:

create or replace function public.assert_safe_0012_rollback()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.stock_reservations r where r.status = 'active'
  ) then
    raise exception
      'Rollback aborted: active stock reservations exist. Release them first (STEP 2).';
  end if;

  if coalesce(current_setting('atlas.allow_destructive_rollback', true), '') <> 'on' then
    raise exception
      'Rollback aborted: this drops payment history. Archive it (STEP 4), then set atlas.allow_destructive_rollback = on for this session.';
  end if;
end;
$$;

revoke execute on function public.assert_safe_0012_rollback()
  from public, anon, authenticated;
grant execute on function public.assert_safe_0012_rollback()
  to service_role;
--
-- STEP 1 — Inspect (read-only):
--   select count(*) from public.stock_reservations where status = 'active';
--   select count(*) from public.payment_transactions;
--   select count(*) from public.payment_refunds;
--   select count(*) from public.payment_webhook_events;
--   select count(*) from public.orders where payment_status <> 'not_required';
--
-- STEP 2 — Release every live hold BEFORE any DDL. This restores stock:
--   select public.expire_stale_reservations(1000);           -- expired only
--   -- For unexpired holds, release each explicitly:
--   select public.release_order_reservation(order_id, 'rollback')
--     from public.stock_reservations where status = 'active';
--
-- STEP 3 — Archive before dropping anything:
--   create table if not exists public._archive_0012_orders_payment as
--     select id, payment_method, payment_status, payment_gateway,
--            payment_amount, payment_currency, paid_at
--     from public.orders;
--   create table if not exists public._archive_0012_payment_transactions as
--     select * from public.payment_transactions;
--   create table if not exists public._archive_0012_payment_refunds as
--     select * from public.payment_refunds;
--   create table if not exists public._archive_0012_webhook_events as
--     select * from public.payment_webhook_events;
--   -- Lock the archive tables down (they contain customer/payment data):
--   alter table public._archive_0012_orders_payment     enable row level security;
--   alter table public._archive_0012_payment_transactions enable row level security;
--   alter table public._archive_0012_payment_refunds      enable row level security;
--   alter table public._archive_0012_webhook_events       enable row level security;
--   revoke all on table public._archive_0012_orders_payment,
--     public._archive_0012_payment_transactions,
--     public._archive_0012_payment_refunds,
--     public._archive_0012_webhook_events from anon, authenticated;
--
-- STEP 4 — Hard safety gate. Run this and fix anything it reports:
--   set atlas.allow_destructive_rollback = 'on';   -- only after STEP 3 archive
--   select public.assert_safe_0012_rollback();
--
-- STEP 5 — Drop, in dependency order (only after STEP 2-4):
--   drop trigger if exists orders_guard_payment_state on public.orders;
--   drop function if exists public.guard_order_payment_state();
--   drop trigger if exists products_prevent_reserved_delete on public.products;
--   drop trigger if exists variants_prevent_reserved_delete on public.variants;
--   drop function if exists public.prevent_reserved_stock_delete();
--   drop function if exists public.assert_safe_0012_rollback();
--   drop function if exists public.record_verified_refund(uuid, text, text, text, numeric, text, text, jsonb);
--   drop function if exists public.mark_payment_webhook_processed(uuid, uuid, text, text);
--   drop function if exists public.claim_payment_webhook(text, text, text, jsonb, integer);
--   drop function if exists public.fail_order_payment(uuid, text, text, text, text, jsonb);
--   drop function if exists public.finalize_paid_order(uuid, text, text, text, numeric, text, jsonb);
--   drop function if exists public.record_verified_payment(uuid, text, text, text, numeric, text, jsonb);
--   drop function if exists public.expire_stale_reservations(integer);
--   drop function if exists public.release_order_reservation(uuid, text, uuid);
--   drop function if exists public.reserve_order_stock(uuid, integer);
--   drop table if exists public.payment_refunds;
--   drop table if exists public.payment_webhook_events;
--   drop table if exists public.payment_transactions;
--   drop table if exists public.stock_reservation_items;
--   drop table if exists public.stock_reservations;
--   alter table public.orders
--     drop constraint if exists orders_online_payment_status_check,
--     drop constraint if exists orders_cod_payment_status_check,
--     drop constraint if exists orders_paid_at_check,
--     drop constraint if exists orders_payment_status_check,
--     drop constraint if exists orders_payment_method_check,
--     drop column if exists paid_at,
--     drop column if exists payment_currency,
--     drop column if exists payment_amount,
--     drop column if exists payment_gateway,
--     drop column if exists payment_status,
--     drop column if exists payment_method;
--
-- WARNING: even after archiving, dropping the columns makes historical orders
-- look like COD orders. Do not run STEP 5 until the archive tables have been
-- verified and backed up outside Supabase.


-- ============================================================================
-- SECTION 15 — Post-apply verification (read-only)
-- ============================================================================
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='orders'
--      and (column_name like 'payment%' or column_name = 'paid_at');
--
--   select count(*) from public.orders where payment_method <> 'cod';   -- 0
--   select count(*) from public.orders where payment_status <> 'not_required'; -- 0
--
--   -- A COD order must still confirm through n8n exactly as before:
--   --   select * from public.confirm_order('<cod-order-uuid>');
--   -- A non-COD pending order must be refused by the guard:
--   --   select * from public.confirm_order('<online-order-uuid>');  -> raises
--
--   -- Reservation lifecycle on a staging online order:
--   --   select * from public.reserve_order_stock('<uuid>');
--   --   select * from public.reserve_order_stock('<uuid>');  -- 'active', no 2nd deduction
--   --   select * from public.release_order_reservation('<uuid>', 'test');
--   --   select * from public.release_order_reservation('<uuid>', 'test');  -- no-op
--
--   -- Webhook claim / duplicate / retry:
--   --   select * from public.claim_payment_webhook('safepay','evt_1','payment.succeeded','{}',300);
--   --   -- second call while leased: claimed = false, 'Currently processing...'
--   --   select * from public.mark_payment_webhook_processed('<event_id>','<lock_token>','failed','transient');
--   --   -- after backoff, claim returns claimed = true with a NEW lock_token
--   --   -- a stale worker calling mark_... with the OLD token must return false
--   --   select * from public.mark_payment_webhook_processed('<event_id>','<lock_token>','processed',null);
--   --   -- duplicate delivery now returns claimed = false, 'Already processed; skip'
--
--   -- Paid-state protection:
--   --   update public.orders set payment_status='pending' where id='<paid-order>';  -> raises
--   --   update public.orders set payment_amount=1 where id='<paid-order>';           -> raises
--
--   -- Stock reference protection:
--   --   delete from public.products where id='<reserved-product>';  -> raises (soft-disable instead)
--   --   delete from public.variants where id='<reserved-variant>';  -> raises
--
--   -- Refund (after a succeeded transaction):
--   --   select * from public.record_verified_refund('<order>','safepay','sandbox',
--   --     '<refund-id>', 100, 'PKR', 'customer request', '{}');
--   --   -- repeating the same refund id returns ok = true (idempotent)
--   --   -- after a full refund, repeating the SAME id still returns ok = true
--   --   -- same id with different amount/currency/order/transaction -> ok = false
--   --   select status from public.payment_transactions where id='<txn>';  -- still 'succeeded'
--
--   -- Failure callback with a mismatched ledger amount/currency:
--   --   update public.payment_transactions set amount = 1 where id='<txn>';  -- staging only
--   --   select * from public.fail_order_payment(...);  -- ok = false, reservation still active
--
--   -- Reservation after payment/finalization:
--   --   select * from public.reserve_order_stock('<paid-or-finalized-order>');
--   --   -- invalid_payment_state / already_finalized
-- ============================================================================phely ad
