import { notFound } from 'next/navigation';
import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import OrderStatusForm from '@/components/order-status-form';
import { adminGetOrder } from '@/lib/queries/admin';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [order, settings] = await Promise.all([
    adminGetOrder(params.id),
    getSiteSettings(),
  ]);
  if (!order) notFound();
  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Order detail</h1>
        <Link href="/admin/orders" className="text-sm text-clay">
          Back to orders
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <OrderStatusBadge status={order.status} />
        <p className="text-sm text-muted">
          {order.id} · {new Date(order.created_at).toLocaleString()}
        </p>
      </div>

      <div className="mb-8">
        <OrderStatusForm orderId={order.id} status={order.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-medium mb-3">Items</h2>
          <div className="flex flex-col gap-2 border-y border-line py-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.title_snapshot}
                  {item.variant_label_snapshot ? ` (${item.variant_label_snapshot})` : ''} x{item.quantity}
                </span>
                <span>{formatPrice(item.line_total, currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 text-sm mt-4">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{formatPrice(order.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Delivery</span>
              <span>{formatPrice(order.delivery_fee, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-medium pt-2 border-t border-line">
              <span>Total</span>
              <span>{formatPrice(order.total, currency)}</span>
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-medium mb-3">Customer</h2>
          <p>{order.customer_name}</p>
          <p className="text-muted">{order.email}</p>
          <p className="text-muted">{order.phone}</p>
          {order.alternate_phone && <p className="text-muted">Alt: {order.alternate_phone}</p>}
          <p className="text-muted mt-2">{order.address}, {order.city}</p>
          {order.preferred_delivery_time && (
            <p className="text-muted">Preferred time: {order.preferred_delivery_time}</p>
          )}
          {order.delivery_instructions && (
            <p className="text-muted">Instructions: {order.delivery_instructions}</p>
          )}
          {order.notes && <p className="text-muted">Notes: {order.notes}</p>}
          <p className="text-sm text-muted mt-4">Cash on delivery.</p>
        </div>
      </div>
    </div>
  );
}
