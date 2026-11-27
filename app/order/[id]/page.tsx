import { notFound } from 'next/navigation';
import OrderLookupForm from '@/components/order-lookup-form';
import OrderStatusBadge from '@/components/order-status-badge';
import TrackingTimeline from '@/components/tracking-timeline';
import { getOrderWithItems, canViewOrder } from '@/lib/queries/orders';
import { getOrderTrackingEvents } from '@/lib/queries/account';
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

  // Tracking updates are ordered oldest-first for the timeline.
  const tracking = [...(await getOrderTrackingEvents(order.id))].reverse();

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
          <div key={item.id} className="flex justify-between gap-3 text-sm">
            <div className="flex items-start gap-3">
              {item.image_snapshot_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_snapshot_url}
                  alt={item.title_snapshot}
                  className="w-12 h-16 object-cover border border-line shrink-0"
                  loading="lazy"
                />
              ) : null}
              <span>
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

      <div className="mt-10 border-t border-line dark:border-dark-line pt-6">
        <h2 className="font-medium mb-4">Delivery progress</h2>
        <TrackingTimeline currentStatus={order.status} events={tracking} />
      </div>
    </section>
  );
}
