import { notFound } from 'next/navigation';
import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import { adminGetCustomer } from '@/lib/queries/admin';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [{ customer, orders }, settings] = await Promise.all([
    adminGetCustomer(params.id),
    getSiteSettings(),
  ]);
  if (!customer) notFound();
  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Customer</h1>
        <Link href="/admin/customers" className="text-sm theme-text">
          Back to customers
        </Link>
      </div>

      <div className="mb-8 text-sm">
        <p className="font-medium text-base">{customer.name || '(no name)'}</p>
        <p className="text-muted dark:text-dark-muted">{customer.email}</p>
        {customer.phone && <p className="text-muted dark:text-dark-muted">{customer.phone}</p>}
        <p className="text-muted dark:text-dark-muted mt-2">
          Joined {new Date(customer.created_at).toLocaleDateString()}
        </p>
      </div>

      <h2 className="font-medium mb-3">Orders</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No orders linked to this account.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
            >
              <span className="text-muted dark:text-dark-muted">
                {new Date(o.created_at).toLocaleDateString()} · {o.item_count} items
              </span>
              <span className="flex items-center gap-3">
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
