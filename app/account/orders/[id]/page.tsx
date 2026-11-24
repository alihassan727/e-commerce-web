import { notFound } from 'next/navigation';
import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import TrackingTimeline from '@/components/tracking-timeline';
import { getMyCustomer, getMyOrderDetail } from '@/lib/queries/account';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AccountOrderDetailPage({ params }: { params: { id: string } }) {
  const [customer, settings] = await Promise.all([getMyCustomer(), getSiteSettings()]);
  if (!customer) return null;
  const currency = settings?.currency ?? 'PKR';

  const result = await getMyOrderDetail(params.id, customer.id);
  if (!result) notFound();
  const { order, tracking } = result;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Order details</h1>
        <Link href="/account/orders" className="text-sm theme-text">Back to orders</Link>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <OrderStatusBadge status={order.status} />
        <p className="text-sm text-muted dark:text-dark-muted">
          {order.id} placed on {new Date(order.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Items + totals */}
        <div>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Items</h2>
          <div className="border-y border-line dark:border-dark-line py-4 flex flex-col gap-2 mb-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-ink dark:text-dark-ink">
                  {item.title_snapshot}
                  {item.variant_label_snapshot ? ` (${item.variant_label_snapshot})` : ''} x{item.quantity}
                </span>
                <span className="text-ink dark:text-dark-ink">{formatPrice(item.line_total, currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-muted">Subtotal</span>
              <span>{formatPrice(order.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-muted">Delivery</span>
              <span>{formatPrice(order.delivery_fee, currency)}</span>
            </div>
            <div className="flex justify-between font-medium border-t border-line dark:border-dark-line pt-2 mt-1">
              <span>Total</span>
              <span>{formatPrice(order.total, currency)}</span>
            </div>
          </div>
        </div>

        {/* Tracking timeline */}
        <div>
          <h2 className="font-medium mb-4 text-ink dark:text-dark-ink">Delivery progress</h2>
          <TrackingTimeline currentStatus={order.status} events={tracking} />
        </div>
      </div>

      {/* Delivery info */}
      <div className="mt-8 border-t border-line dark:border-dark-line pt-6 text-sm">
        <h2 className="font-medium mb-2 text-ink dark:text-dark-ink">Delivery details</h2>
        <p className="text-ink dark:text-dark-ink">{order.customer_name}</p>
        <p className="text-muted dark:text-dark-muted">{order.phone}</p>
        <p className="text-muted dark:text-dark-muted">{order.address}, {order.city}</p>
      </div>
    </div>
  );
}
