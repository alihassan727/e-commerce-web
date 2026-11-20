import { notFound } from 'next/navigation';
import OrderLookupForm from '@/components/order-lookup-form';
import OrderStatusBadge from '@/components/order-status-badge';
import { getOrderWithItems, canViewOrder } from '@/lib/queries/orders';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { placed?: string; email?: string };
}) {
  const id = params.id;
  const placed = searchParams?.placed === '1';
  const suppliedEmail =
    typeof searchParams?.email === 'string' ? searchParams.email : undefined;

  const order = await getOrderWithItems(id);
  if (!order) {
    notFound();
  }

  const settings = await getSiteSettings();
  const currency = settings?.currency ?? 'PKR';

  const allowed = await canViewOrder(order, suppliedEmail);
  if (!allowed) {
    return <OrderLookupForm orderId={id} placed={placed} />;
  }

  const placedOn = new Date(order.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <section className="container-page py-12 max-w-2xl">
      {placed ? (
        <div className="border border-line p-5 mb-8">
          <p className="font-medium">Order received. Thank you.</p>
          <p className="text-sm text-muted mt-1">
            We are confirming stock and will email you at {order.email}. Save this order number to check back later.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-2">
        <h1 className="font-serif text-3xl">Order</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-sm text-muted mb-8">
        {order.id} placed on {placedOn}
      </p>

      <div className="flex flex-col gap-2 mb-8 border-y border-line py-6">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.title_snapshot}
              {item.variant_label_snapshot ? ` (${item.variant_label_snapshot})` : null} x{item.quantity}
            </span>
            <span>{formatPrice(item.line_total, currency)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 text-sm">
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

      <div className="mt-8 text-sm">
        <h2 className="font-medium mb-2">Delivery details</h2>
        <p>{order.customer_name}</p>
        <p className="text-muted">{order.phone}</p>
        <p className="text-muted">{order.email}</p>
        <p className="text-muted">{order.address}, {order.city}</p>
        {order.preferred_delivery_time ? (
          <p className="text-muted">Preferred time: {order.preferred_delivery_time}</p>
        ) : null}
        {order.delivery_instructions ? (
          <p className="text-muted">Notes: {order.delivery_instructions}</p>
        ) : null}
      </div>

      <div className="mt-8">
        <p className="text-sm text-muted">Cash on delivery.</p>
      </div>
    </section>
  );
}
