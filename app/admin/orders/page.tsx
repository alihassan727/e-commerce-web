import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import { adminListOrders } from '@/lib/queries/admin';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from '@/lib/order-status';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const [orders, settings] = await Promise.all([
    adminListOrders({ status: searchParams.status, search: searchParams.q }),
    getSiteSettings(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const currentStatus = searchParams.status ?? 'all';

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Orders</h1>

      <form method="get" action="/admin/orders" className="flex flex-wrap items-end gap-3 mb-6">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            className="input"
            defaultValue={searchParams.q ?? ''}
            placeholder="email, phone, name or order id"
          />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={currentStatus}>
            <option value="all">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-outline">
          Filter
        </button>
      </form>

      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders match.</p>
      ) : (
        <div className="border border-line">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 px-4 py-3 border-b border-line last:border-0 text-sm"
            >
              <span className="truncate">
                {o.customer_name} · {o.email} · {o.city}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted">{new Date(o.created_at).toLocaleDateString()}</span>
                <span>{formatPrice(o.total, currency)}</span>
                <OrderStatusBadge status={o.status} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
