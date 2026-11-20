import type { OrderStatus } from '@/lib/types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending stock check',
  confirmed: 'Confirmed',
  out_of_stock: 'Out of stock',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'out_of_stock',
  'shipped',
  'delivered',
  'cancelled',
];

/**
 * Statuses an admin can set manually through the UI.
 * 'confirmed' is excluded because it is only produced by confirm_order(),
 * which deducts stock atomically. Allowing manual confirmation would let
 * stock be shown as committed without the deduction actually happening.
 */
export const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  'pending',
  'out_of_stock',
  'shipped',
  'delivered',
  'cancelled',
];
