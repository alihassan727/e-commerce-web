import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Customer,
  CustomerAddress,
  Order,
  OrderItem,
  OrderTrackingEvent,
  OrderWithItems,
  SupportTicket,
  TicketNote,
} from '@/lib/types';

/** Returns the customer row for the currently logged-in user, or null. */
export async function getMyCustomer(): Promise<Customer | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('customers')
    .select('*')
    .eq('auth_uid', user.id)
    .maybeSingle();
  return data as Customer | null;
}

/** Returns basic stats for the customer dashboard. */
export async function getMyStats(customerId: string): Promise<{
  total_orders: number;
  total_spent: number;
  pending_orders: number;
  delivered_orders: number;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('status,total')
    .eq('customer_id', customerId);
  const rows = (data ?? []) as { status: string; total: number }[];
  return {
    total_orders: rows.length,
    total_spent: rows
      .filter((r) => ['confirmed', 'shipped', 'delivered'].includes(r.status))
      .reduce((s, r) => s + Number(r.total), 0),
    pending_orders: rows.filter((r) => r.status === 'pending').length,
    delivered_orders: rows.filter((r) => r.status === 'delivered').length,
  };
}

/** Returns all saved addresses for the customer. */
export async function getMyAddresses(customerId: string): Promise<CustomerAddress[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  return (data ?? []) as CustomerAddress[];
}

/** Returns all orders with items for the signed-in customer. */
export async function getMyOrders(customerId: string): Promise<OrderWithItems[]> {
  const admin = createAdminClient();
  const { data: orders } = await admin
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
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

/** Returns one order with its items and tracking events (for customer view). */
export async function getMyOrderDetail(
  orderId: string,
  customerId: string,
): Promise<{ order: OrderWithItems; tracking: OrderTrackingEvent[] } | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (!order) return null;
  const { data: items } = await admin
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  const { data: tracking } = await admin
    .from('order_tracking_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  return {
    order: { ...(order as Order), items: (items ?? []) as OrderItem[] },
    tracking: (tracking ?? []) as OrderTrackingEvent[],
  };
}

/** Returns all support tickets for the customer. */
export async function getMyTickets(customerId: string): Promise<SupportTicket[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('support_tickets')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  return (data ?? []) as SupportTicket[];
}

/** Returns one ticket (and its notes if admin — customer sees no notes). */
export async function getMyTicket(
  ticketId: string,
  customerId: string,
): Promise<SupportTicket | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .eq('customer_id', customerId)
    .maybeSingle();
  return data as SupportTicket | null;
}

// ---------------------------------------------------------------------------
// Admin ticket queries
// ---------------------------------------------------------------------------

export interface AdminTicketRow extends SupportTicket {
  order_number?: string | null;
}

export async function adminListTickets(filter?: {
  status?: string;
  search?: string;
}): Promise<AdminTicketRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') {
    q = q.eq('status', filter.status);
  }
  if (filter?.search?.trim()) {
    const s = filter.search.trim();
    q = q.or(
      `ticket_number.ilike.%${s}%,customer_name.ilike.%${s}%,email.ilike.%${s}%`,
    );
  }
  const { data } = await q;
  return (data ?? []) as AdminTicketRow[];
}

export async function adminGetTicket(id: string): Promise<{
  ticket: SupportTicket;
  notes: TicketNote[];
} | null> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!ticket) return null;
  const { data: notes } = await admin
    .from('ticket_notes')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });
  return {
    ticket: ticket as SupportTicket,
    notes: (notes ?? []) as TicketNote[],
  };
}

// ---------------------------------------------------------------------------
// Order tracking queries (admin)
// ---------------------------------------------------------------------------

export async function getOrderTrackingEvents(
  orderId: string,
): Promise<OrderTrackingEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('order_tracking_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  return (data ?? []) as OrderTrackingEvent[];
}

// ---------------------------------------------------------------------------
// Admin CMS social links + features
// ---------------------------------------------------------------------------

export async function adminListSocialLinks() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('social_links')
    .select('*')
    .order('sort_order', { ascending: true });
  return data ?? [];
}

export async function adminListFeatures() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cms_features')
    .select('*')
    .order('sort_order', { ascending: true });
  return data ?? [];
}
