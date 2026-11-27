import { statusLabel } from '@/lib/order-status';
import type { OrderStatus } from '@/lib/types';

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const color =
    status === 'confirmed' ||
    status === 'shipped' ||
    status === 'delivered'
      ? 'theme-text'
      : status === 'out_of_stock' || status === 'cancelled'
        ? 'text-muted dark:text-dark-muted'
        : 'text-ink dark:text-dark-ink';

  return (
    <span className={`inline-block border border-line dark:border-dark-line px-2 py-0.5 text-sm ${color}`}>
      {statusLabel(status)}
    </span>
  );
}
