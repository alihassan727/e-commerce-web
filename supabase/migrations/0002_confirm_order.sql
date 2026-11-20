-- ============================================================================
-- Atlas Clothier - 0002: atomic order confirmation + admin status RPC (final)
--
--   public.confirm_order(p_order_id uuid)
--     Validates every line, checks and deducts stock in one transaction with
--     row locks. Called by n8n via the service-role key.
--     Compatible with the n8n workflow: call via POST /rpc/confirm_order with
--     body { "p_order_id": "<uuid>" } using the service-role credential.
--     Returns { order_id, confirmed, status, message }. Branch the n8n IF
--     node on confirmed = true.
--
--   public.admin_update_order_status(p_order_id uuid,
--                                    p_status public.order_status)
--     Atomically validates and applies an admin status change. Locks the SAME
--     order row as confirm_order so both operations serialize: a concurrent
--     admin update and confirm_order on the same order can never interleave.
--
-- SECURITY DEFINER SET search_path = ''
--   The search_path is intentionally empty. Every user-defined object is
--   referenced with its explicit schema (public.*). Built-in pg_catalog
--   objects (now(), count(), sum(), jsonb_build_object(), jsonb_agg(),
--   coalesce(), perform, raise, etc.) resolve without a search_path because
--   pg_catalog is always implicitly searched first regardless of search_path.
--   This prevents search_path injection: no object in any other schema can
--   shadow a public.* name used inside these functions.
--
-- FK locking note (confirmed from 0001_init.sql):
--   order_items.order_id is NOT NULL REFERENCES public.orders(id) ON DELETE
--   CASCADE, non-deferrable. PostgreSQL acquires a KEY SHARE lock on the
--   referenced orders row to enforce this FK on every INSERT into order_items.
--   KEY SHARE conflicts with FOR UPDATE, so any INSERT of a new order_items
--   row for this order blocks until our transaction completes. New items
--   cannot appear between our locking step and our deduction step.
--   However, existing order_items rows can still be UPDATED by a concurrent
--   transaction while we hold only the order-row lock. We therefore lock the
--   order_items rows explicitly (step 2) before reading them.
--
-- Lock ordering (always applied in this sequence to prevent deadlocks):
--   1. public.orders row  (FOR UPDATE)
--   2. public.order_items rows  (FOR UPDATE, ordered by id asc)
--   3. public.variants rows  (FOR UPDATE, ordered by id asc)
--   4. public.products rows  (FOR UPDATE, ordered by id asc)
--
-- Only ADDS functions and adjusts execute privileges. No existing tables,
-- columns, enums, triggers, or policies are modified. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- confirm_order
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid)
returns table (
  order_id  uuid,
  confirmed boolean,
  status    text,
  message   text
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_status    public.order_status;
  v_vid       uuid;
  v_pid       uuid;
  v_item      record;
  v_avail     integer;
  v_owner_pid uuid;
  v_has_var   boolean;
  v_short     boolean := false;
  v_has_rows  boolean := false;
begin
  -- 1) Lock the order row; idempotency. Only a 'pending' order is processed,
  --    so a retried webhook never deducts stock twice.
  select o.status into v_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query select p_order_id, false, 'not_found'::text, 'Order not found'::text;
    return;
  end if;

  if v_status <> 'pending'::public.order_status then
    return query
      select p_order_id,
             (v_status = 'confirmed'::public.order_status),
             v_status::text,
             'Already processed'::text;
    return;
  end if;

  -- 2) Lock all existing order_items rows for this order, ordered by their
  --    primary key (id uuid) for determinism. This prevents a concurrent
  --    transaction from updating an existing item's quantity, product_id, or
  --    variant_id between our validation, stock-check, and deduction steps.
  --    New inserts are already blocked by the KEY SHARE / FOR UPDATE conflict
  --    on the parent orders row (see header note).
  perform 1
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.id
  for update;

  -- 3) Lock every stock row in a fixed order (variants by id, then simple
  --    products by id) to avoid deadlocks between concurrent orders.
  for v_vid in
    select distinct oi.variant_id
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
    order by oi.variant_id
  loop
    perform 1 from public.variants v where v.id = v_vid for update;
  end loop;

  for v_pid in
    select distinct oi.product_id
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is null
    order by oi.product_id
  loop
    perform 1 from public.products p where p.id = v_pid for update;
  end loop;

  -- 4) Validate EVERY line (reading the now-locked rows). Hard data-integrity
  --    violations raise an exception, which rolls back the whole function:
  --    no stock is modified and the order stays 'pending'.
  for v_item in
    select oi.product_id, oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    v_has_rows := true;

    -- Quantity must be strictly positive.
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Order % has an invalid quantity (%).', p_order_id, v_item.quantity;
    end if;

    if v_item.variant_id is not null then
      -- The referenced variant must exist (defense-in-depth; the FK on
      -- order_items.variant_id is the primary guarantor at insert time, but
      -- the variant could be deleted after order placement, setting variant_id
      -- to null via ON DELETE SET NULL - that path is caught by the else branch).
      select v.product_id into v_owner_pid
      from public.variants v
      where v.id = v_item.variant_id;

      if not found then
        raise exception 'Order % references a missing variant (%).',
          p_order_id, v_item.variant_id;
      end if;
      -- The variant must belong to the product_id on this line.
      if v_item.product_id is null or v_owner_pid is distinct from v_item.product_id then
        raise exception 'Order %: variant % does not belong to product (%).',
          p_order_id, v_item.variant_id, v_item.product_id;
      end if;
    else
      if v_item.product_id is null then
        raise exception 'Order % has a line with no product reference.', p_order_id;
      end if;
      select p.has_variants into v_has_var
      from public.products p
      where p.id = v_item.product_id;

      if not found then
        raise exception 'Order % references a missing product (%).',
          p_order_id, v_item.product_id;
      end if;
      -- A variant product ordered without a variant_id is invalid; this is
      -- the reachable case when a variant is deleted (ON DELETE SET NULL).
      if v_has_var then
        raise exception
          'Order %: product % is a variant product but the line has no variant_id.',
          p_order_id, v_item.product_id;
      end if;
    end if;
  end loop;

  if not v_has_rows then
    return query select p_order_id, false, v_status::text, 'Order has no items'::text;
    return;
  end if;

  -- 5) Stock sufficiency across ALL items, aggregated per stock row.
  --    total_qty is bigint (sum of integers) to avoid integer overflow on
  --    large aggregates; deduction is safe because total_qty <= stock is
  --    guaranteed by the check below before any deduction occurs.
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

  -- 6) If any item is short, deduct NOTHING and mark out of stock.
  if v_short then
    update public.orders
    set status = 'out_of_stock'::public.order_status
    where id = p_order_id;

    insert into public.order_audit (order_id, event, payload)
    values (
      p_order_id,
      'out_of_stock',
      jsonb_build_object('reason', 'insufficient stock', 'checked_at', now())
    );

    return query
      select p_order_id, false, 'out_of_stock'::text, 'Insufficient stock'::text;
    return;
  end if;

  -- 7) All available: deduct per stock row, confirm, and audit in one
  --    transaction. A failure at any step rolls back every deduction
  --    (no partial deduction, no negative stock). The deducted result fits in
  --    integer because total_qty <= v_avail was verified above.
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

  update public.orders
  set status = 'confirmed'::public.order_status
  where id = p_order_id;

  insert into public.order_audit (order_id, event, payload)
  values (
    p_order_id,
    'confirmed',
    jsonb_build_object(
      'confirmed_at', now(),
      'items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'product_id', oi.product_id,
              'variant_id', oi.variant_id,
              'quantity',   oi.quantity
            )
            order by oi.variant_id nulls last
          )
          from public.order_items oi
          where oi.order_id = p_order_id
        ),
        '[]'::jsonb
      )
    )
  );

  return query select p_order_id, true, 'confirmed'::text, 'Order confirmed'::text;
end;
$$;


-- ---------------------------------------------------------------------------
-- admin_update_order_status
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status   public.order_status
)
returns table (
  order_id uuid,
  ok       boolean,
  status   text,
  message  text
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_current       public.order_status;
  v_count         bigint;
  v_was_confirmed boolean := false;
begin
  -- 1) Reject null status before any other work.
  --    PostgREST rejects an invalid enum string before the function body runs,
  --    but a SQL NULL passes enum parameter type-checking and must be caught
  --    here explicitly to prevent a NULL from reaching the UPDATE statement.
  if p_status is null then
    return query
      select p_order_id, false, 'invalid'::text, 'Status must not be null'::text;
    return;
  end if;

  -- 2) Lock the SAME order row confirm_order locks, so an admin update and a
  --    confirm_order on the same order serialize and never interleave.
  select o.status into v_current
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query
      select p_order_id, false, 'not_found'::text, 'Order not found'::text;
    return;
  end if;

  -- 3) 'confirmed' is only ever produced by confirm_order (which deducts
  --    stock atomically). Admins cannot set it manually.
  if p_status = 'confirmed'::public.order_status then
    return query
      select p_order_id, false, v_current::text,
        'Status confirmed is set automatically and cannot be set manually'::text;
    return;
  end if;

  -- 4) Evidence that stock was already deducted: a 'confirmed' audit row.
  select count(*) into v_count
  from public.order_audit
  where order_id = p_order_id
    and event = 'confirmed';

  v_was_confirmed := (v_count > 0);

  -- 5) Stock-safety guards based on audit evidence.
  --    Re-opening a confirmed order to 'pending' would let confirm_order
  --    deduct stock again on the next n8n run.
  if p_status = 'pending'::public.order_status and v_was_confirmed then
    return query
      select p_order_id, false, v_current::text,
        'Order was already confirmed and stock was deducted; cannot move back to pending'::text;
    return;
  end if;

  -- Shipping or delivering before confirmation bypasses the stock check.
  if p_status in (
       'shipped'::public.order_status,
       'delivered'::public.order_status
     )
     and not v_was_confirmed
  then
    return query
      select p_order_id, false, v_current::text,
        'Order has not been confirmed yet; cannot ship or deliver'::text;
    return;
  end if;

  -- 6) Idempotent no-op: same status is returned as success.
  if p_status = v_current then
    return query select p_order_id, true, v_current::text, 'No change'::text;
    return;
  end if;

  -- 7) Explicit allowed transition table.
  --    pending      -> out_of_stock | cancelled
  --    out_of_stock -> pending      | cancelled   (pending = retry after restock)
  --    confirmed    -> shipped      | cancelled
  --    shipped      -> delivered    | cancelled
  --    delivered    -> cancelled
  --    cancelled    -> (terminal; same-status no-op handled above)
  if not (
       (v_current = 'pending'::public.order_status
          and p_status in (
                'out_of_stock'::public.order_status,
                'cancelled'::public.order_status))
    or (v_current = 'out_of_stock'::public.order_status
          and p_status in (
                'pending'::public.order_status,
                'cancelled'::public.order_status))
    or (v_current = 'confirmed'::public.order_status
          and p_status in (
                'shipped'::public.order_status,
                'cancelled'::public.order_status))
    or (v_current = 'shipped'::public.order_status
          and p_status in (
                'delivered'::public.order_status,
                'cancelled'::public.order_status))
    or (v_current = 'delivered'::public.order_status
          and p_status = 'cancelled'::public.order_status)
  ) then
    return query
      select p_order_id, false, v_current::text,
        ('Transition ' || v_current::text || ' -> ' || p_status::text
         || ' is not allowed')::text;
    return;
  end if;

  -- 8) Apply the update within the same transaction.
  update public.orders
  set status = p_status
  where id = p_order_id;

  return query select p_order_id, true, p_status::text, 'Updated'::text;
end;
$$;


-- ---------------------------------------------------------------------------
-- Privileges: only service_role (n8n + admin server action) may call either
-- function. anon and authenticated are explicitly denied.
-- Revoking from public covers all roles not explicitly granted.
-- Revoking from anon and authenticated is defense-in-depth in case a future
-- migration accidentally re-grants to public.
-- ---------------------------------------------------------------------------
revoke execute
  on function public.confirm_order(uuid)
  from public, anon, authenticated;

grant execute
  on function public.confirm_order(uuid)
  to service_role;

revoke execute
  on function public.admin_update_order_status(uuid, public.order_status)
  from public, anon, authenticated;

grant execute
  on function public.admin_update_order_status(uuid, public.order_status)
  to service_role;
