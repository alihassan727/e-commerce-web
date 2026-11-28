import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Order, OrderItem, OrderWithItems } from '@/lib/types';

/**
 * Returns an order with its items. Uses the service-role client (bypasses RLS)
 * because order reads are access-controlled in code, not via RLS policies.
 * The caller is responsible for verifying the requester may see this order.
 */
export async function getOrderWithItems(
  id: string,
): Promise<OrderWithItems | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!order) return null;

  // order_items has no timestamp/sort column; keep the table's natural order.
  const { data: items } = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', id);

  return {
    ...(order as Order),
    items: (items ?? []) as OrderItem[],
  };
}

/**
 * Decides whether the current request may view the given order.
 *  - Signed-in users: allowed if the order email matches their email, or the
 *    order belongs to their customer row.
 *  - Guests: allowed only when the supplied email matches the order email
 *    (case-insensitive).
 */
export async function canViewOrder(
  order: Pick<Order, 'email' | 'customer_id'>,
  suppliedEmail?: string,
): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (user.email && order.email.toLowerCase() === user.email.toLowerCase())
      return true;
    if (order.customer_id) {
      const admin = createAdminClient();
      const { data: cust } = await admin
        .from('customers')
        .select('auth_uid')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (cust?.auth_uid === user.id) return true;
    }
  }

  if (suppliedEmail && order.email.toLowerCase() === suppliedEmail.toLowerCase())
    return true;

  return false;
}
