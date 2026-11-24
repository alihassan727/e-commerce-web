import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import { getMyCustomer, getMyOrders } from '@/lib/queries/account';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';
import DeleteAccountButton from '@/components/delete-account-button';

export default async function AccountOrdersPage() {
  const [customer, settings] = await Promise.all([getMyCustomer(), getSiteSettings()]);
  if (!customer) return null;
  const currency = settings?.currency ?? 'PKR';
  const orders = await getMyOrders(customer.id);

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Your orders</h1>

      {orders.length === 0 ? (
        <div className="border border-line dark:border-dark-line p-8 text-center">
          <p className="text-muted dark:text-dark-muted">No orders yet.</p>
          <Link href="/shop" className="btn btn-primary mt-4">Shop now</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/account/orders/${o.id}`}
              className="block border border-line dark:border-dark-line p-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs text-muted dark:text-dark-muted">
                    {new Date(o.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="font-medium mt-1 text-ink dark:text-dark-ink">{formatPrice(o.total, currency)}</p>
                  <p className="text-sm text-muted dark:text-dark-muted mt-1">
                    {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-16 pt-6 border-t border-line dark:border-dark-line">
        <h2 className="font-medium text-sm mb-4 text-ink dark:text-dark-ink">Account</h2>
        <DeleteAccountButton />
      </div>
    </div>
  );
}
