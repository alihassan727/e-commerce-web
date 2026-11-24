-- ============================================================================
-- Atlas Clothier - 0006: Fix ambiguous order_id column in
-- admin_update_order_status.
--
-- Root cause: the function's RETURNS TABLE declares a column named order_id,
-- and the function body queries public.order_audit which also has a column
-- named order_id. PostgreSQL cannot resolve the unqualified reference
-- "order_id" in the WHERE clause — it is ambiguous between the table column
-- and the output column, producing:
--   "column reference order_id is ambiguous"
--
-- Fix: fully schema+table-qualify the reference in the WHERE clause so
-- PostgreSQL resolves it unambiguously as the table column.
--
-- All other logic, locking, transition rules, and privileges are unchanged.
-- Safe to re-run.
-- ============================================================================

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
  if p_status is null then
    return query
      select p_order_id, false, 'invalid'::text, 'Status must not be null'::text;
    return;
  end if;

  -- 2) Lock the same order row confirm_order locks.
  select o.status into v_current
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return query
      select p_order_id, false, 'not_found'::text, 'Order not found'::text;
    return;
  end if;

  -- 3) 'confirmed' is only ever produced by confirm_order.
  if p_status = 'confirmed'::public.order_status then
    return query
      select p_order_id, false, v_current::text,
        'Status confirmed is set automatically and cannot be set manually'::text;
    return;
  end if;

  -- 4) Evidence that stock was already deducted: a 'confirmed' audit row.
  --    FIX: qualify "order_id" as "oa.order_id" to avoid ambiguity with the
  --    RETURNS TABLE column of the same name.
  select count(*) into v_count
  from public.order_audit oa
  where oa.order_id = p_order_id
    and oa.event = 'confirmed';

  v_was_confirmed := (v_count > 0);

  -- 5) Stock-safety guards.
  if p_status = 'pending'::public.order_status and v_was_confirmed then
    return query
      select p_order_id, false, v_current::text,
        'Order was already confirmed and stock was deducted; cannot move back to pending'::text;
    return;
  end if;

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

  -- 6) Idempotent no-op.
  if p_status = v_current then
    return query select p_order_id, true, v_current::text, 'No change'::text;
    return;
  end if;

  -- 7) Explicit allowed transition table.
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

-- Preserve the same privileges as the original function.
revoke execute
  on function public.admin_update_order_status(uuid, public.order_status)
  from public, anon, authenticated;

grant execute
  on function public.admin_update_order_status(uuid, public.order_status)
  to service_role;
