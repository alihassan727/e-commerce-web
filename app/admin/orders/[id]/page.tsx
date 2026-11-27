import { notFound } from 'next/navigation';
import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import OrderStatusForm from '@/components/order-status-form';
import AdminTrackingForm from '@/components/admin-tracking-form';
import { adminGetOrder } from '@/lib/queries/admin';
import { getOrderTrackingEvents } from '@/lib/queries/account';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const [order, settings, tracking] = await Promise.all([
    adminGetOrder(params.id),
    getSiteSettings(),
    getOrderTrackingEvents(params.id),
  ]);
  if (!order) notFound();
  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Order detail</h1>
        <Link href="/admin/orders" className="text-sm theme-text">Back to orders</Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <OrderStatusBadge status={order.status} />
        <p className="text-sm text-muted dark:text-dark-muted">{order.id} · {new Date(order.created_at).toLocaleString()}</p>
      </div>

      <div className="mb-8">
        <OrderStatusForm orderId={order.id} status={order.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Items</h2>
          <div className="flex flex-col gap-2 border-y border-line dark:border-dark-line py-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="flex items-start gap-3">
                  {item.image_snapshot_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_snapshot_url}
                      alt={item.title_snapshot}
                      className="w-12 h-16 object-cover border border-line dark:border-dark-line shrink-0"
                      loading="lazy"
                    />
                  ) : null}
                  <span className="text-ink dark:text-dark-ink">
                    {item.title_snapshot}
                    {(item.color_snapshot || item.size_snapshot) ? (
                      ` (${[item.color_snapshot, item.size_snapshot].filter(Boolean).join(' / ')})`
                    ) : item.variant_label_snapshot ? (
                      ` (${item.variant_label_snapshot})`
                    ) : null}{' '}
                    x{item.quantity}
                  </span>
                </div>
                <span>{formatPrice(item.line_total, currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 text-sm mt-4">
            <div className="flex justify-between"><span className="text-muted dark:text-dark-muted">Subtotal</span><span>{formatPrice(order.subtotal, currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted dark:text-dark-muted">Delivery</span><span>{formatPrice(order.delivery_fee, currency)}</span></div>
            <div className="flex justify-between text-base font-medium pt-2 border-t border-line dark:border-dark-line"><span>Total</span><span>{formatPrice(order.total, currency)}</span></div>
          </div>
        </div>
        <div>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Customer</h2>
          <p className="text-ink dark:text-dark-ink">{order.customer_name}</p>
          <p className="text-muted dark:text-dark-muted">{order.email}</p>
          <p className="text-muted dark:text-dark-muted">{order.phone}</p>
          {order.alternate_phone && <p className="text-muted dark:text-dark-muted">Alt: {order.alternate_phone}</p>}
          <p className="text-muted dark:text-dark-muted mt-2">{order.address}, {order.city}</p>
          {order.preferred_delivery_time && <p className="text-muted dark:text-dark-muted">Preferred: {order.preferred_delivery_time}</p>}
          {order.delivery_instructions && <p className="text-muted dark:text-dark-muted">Instructions: {order.delivery_instructions}</p>}
          <p className="text-sm text-muted dark:text-dark-muted mt-4">Cash on delivery.</p>
        </div>
      </div>

      <AdminTrackingForm orderId={order.id} events={tracking} />
    </div>
  );
}
