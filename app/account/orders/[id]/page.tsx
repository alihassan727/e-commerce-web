import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import TrackingTimeline from '@/components/tracking-timeline';
import { getMyCustomer, getMyOrderDetail } from '@/lib/queries/account';
import { getSiteSettings } from '@/lib/queries/catalog';
import { getCustomerReviewedProductIds } from '@/lib/queries/reviews';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/search';
import { formatPrice } from '@/lib/format';

export default async function AccountOrderDetailPage({ params }: { params: { id: string } }) {
  // Avoid a Postgres uuid cast error for malformed URLs.
  if (!isUuid(params.id)) notFound();
  const [customer, settings] = await Promise.all([getMyCustomer(), getSiteSettings()]);
  if (!customer) redirect(`/login?next=/account/orders/${params.id}`);
  const currency = settings?.currency ?? 'PKR';

  const result = await getMyOrderDetail(params.id, customer.id, customer.email);
  if (!result) notFound();
  const { order, tracking } = result;

  // Batch-load product slugs for item links & review eligibility when delivered.
  const productIds = Array.from(
    new Set(order.items.map((it) => it.product_id).filter(Boolean) as string[]),
  );
  const slugMap = new Map<string, string>();
  let reviewedIds = new Set<string>();

  if (productIds.length > 0) {
    const admin = createAdminClient();
    const [{ data: prodRows }, reviewed] = await Promise.all([
      admin.from('products').select('id, slug').in('id', productIds),
      order.status === 'delivered'
        ? getCustomerReviewedProductIds(customer.id, productIds)
        : Promise.resolve(new Set<string>()),
    ]);
    for (const p of prodRows ?? []) {
      slugMap.set(p.id as string, p.slug as string);
    }
    reviewedIds = reviewed;
  }

  const isDelivered = order.status === 'delivered';

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
          <div className="border-y border-line dark:border-dark-line py-4 flex flex-col gap-4 mb-4">
            {order.items.map((item) => {
              const slug = item.product_id ? slugMap.get(item.product_id) : undefined;
              const alreadyReviewed = item.product_id ? reviewedIds.has(item.product_id) : false;
              const variantText = (item.color_snapshot || item.size_snapshot)
                ? [item.color_snapshot, item.size_snapshot].filter(Boolean).join(' / ')
                : item.variant_label_snapshot;

              return (
                <div key={item.id} className="flex justify-between gap-3 text-sm">
                  <div className="flex items-start gap-3">
                    {item.image_snapshot_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_snapshot_url}
                        alt={item.title_snapshot}
                        className="w-12 h-16 object-cover rounded border border-line dark:border-dark-line shrink-0"
                        loading="lazy"
                      />
                    ) : null}
                    <div>
                      {slug ? (
                        <Link href={`/product/${slug}`} className="font-medium text-ink dark:text-dark-ink hover:underline">
                          {item.title_snapshot}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink dark:text-dark-ink">{item.title_snapshot}</span>
                      )}
                      {variantText && (
                        <p className="text-xs text-muted dark:text-dark-muted mt-0.5">{variantText}</p>
                      )}
                      <p className="text-xs text-muted dark:text-dark-muted mt-0.5">Qty: {item.quantity}</p>

                      {isDelivered && item.product_id && slug && (
                        <div className="mt-2">
                          {alreadyReviewed ? (
                            <Link
                              href={`/product/${slug}#reviews`}
                              className="inline-flex items-center gap-1.5 text-xs theme-text hover:underline"
                            >
                              Reviewed · Edit review
                            </Link>
                          ) : (
                            <Link
                              href={`/product/${slug}#reviews`}
                              className="btn btn-outline text-xs py-1 px-2.5"
                            >
                              Write a review
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-ink dark:text-dark-ink whitespace-nowrap">
                    {formatPrice(item.line_total, currency)}
                  </span>
                </div>
              );
            })}
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
