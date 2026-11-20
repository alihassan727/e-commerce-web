import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import { getDashboardData } from '@/lib/queries/admin';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from '@/lib/order-status';
import type { OrderStatus } from '@/lib/types';

export default async function AdminDashboardPage() {
  const [data, settings] = await Promise.all([
    getDashboardData(),
    getSiteSettings(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const totalOrders = ORDER_STATUSES.reduce(
    (sum, s) => sum + (data.counts[s] ?? 0),
    0,
  );

  return (
    <div>
      <h1 className="font-serif text-3xl mb-8">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <div className="border border-line p-4">
          <p className="text-sm text-muted">Revenue</p>
          <p className="text-2xl mt-1">{formatPrice(data.revenue, currency)}</p>
        </div>
        <div className="border border-line p-4">
          <p className="text-sm text-muted">Orders</p>
          <p className="text-2xl mt-1">{totalOrders}</p>
        </div>
        <div className="border border-line p-4">
          <p className="text-sm text-muted">Low stock</p>
          <p className="text-2xl mt-1">{data.lowStockVariants.length + data.lowStockProducts.length}</p>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="font-serif text-xl mb-4">Orders by status</h2>
        {ORDER_STATUSES.map((status) => (
          <div key={status} className="flex items-center justify-between border-b border-line py-2 text-sm">
            <span>{ORDER_STATUS_LABELS[status as OrderStatus]}</span>
            <span>{data.counts[status] ?? 0}</span>
          </div>
        ))}
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl">Recent orders</h2>
          <Link href="/admin/orders" className="text-sm text-clay">
            View all
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="border border-line">
            {data.recent.map((o) => (
              <Link
                key={o.id}
                href={`/admin/orders/${o.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-line last:border-0 text-sm"
              >
                <span className="truncate">
                  {o.customer_name} · {o.city}
                </span>
                <span className="flex items-center gap-3">
                  <span>{formatPrice(o.total, currency)}</span>
                  <OrderStatusBadge status={o.status} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-xl mb-4">
          Low stock (below {data.threshold})
        </h2>
        {data.lowStockProducts.length === 0 && data.lowStockVariants.length === 0 ? (
          <p className="text-sm text-muted">Everything is well stocked.</p>
        ) : (
          <div className="border border-line">
            {data.lowStockProducts.map((p) => (
              <Link
                key={p.id}
                href={`/admin/products/${p.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-line text-sm"
              >
                <span>{p.title}</span>
                <span className="text-muted">{p.stock} in stock</span>
              </Link>
            ))}
            {data.lowStockVariants.map((v) => (
              <Link
                key={v.id}
                href={`/admin/products/${v.product_id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-line text-sm"
              >
                <span>
                  {v.product_title} ({[v.size, v.color].filter(Boolean).join(' / ') || 'variant'})
                </span>
                <span className="text-muted">{v.stock} in stock</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
