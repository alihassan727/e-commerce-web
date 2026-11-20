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

  const { data: items } = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });

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

/**
 * Returns all orders placed with the signed-in user's email (including orders
 * placed as a guest before signing up), newest first, each with its items.
 */
export async function getOrdersForCurrentUser(): Promise<OrderWithItems[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return [];

  const admin = createAdminClient();
  const { data: orders } = await admin
    .from('orders')
    .select('*')
    .ilike('email', user.email)
    .order('created_at', { ascending: false });

  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await admin
    .from('order_items')
    .select('*')
    .in('order_id', ids);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (items ?? []) as OrderItem[]) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  return orders.map((o) => ({
    ...(o as Order),
    items: itemsByOrder.get(o.id) ?? [],
  }));
}
