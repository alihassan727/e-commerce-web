import Link from 'next/link';
import SignOutButton from '@/components/sign-out-button';
import OrderStatusBadge from '@/components/order-status-badge';
import { getCurrentUser } from '@/lib/admin';
import { getOrdersForCurrentUser } from '@/lib/queries/orders';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AccountOrdersPage() {
  const [settings, user] = await Promise.all([
    getSiteSettings(),
    getCurrentUser(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const orders = await getOrdersForCurrentUser();

  return (
    <section className="container-page py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-serif text-3xl">Your orders</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-muted mb-8">Signed in as {user?.email}</p>

      {orders.length === 0 ? (
        <p className="text-muted">No orders yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/order/${order.id}?email=${encodeURIComponent(order.email)}`}
              className="block border border-line p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted">
                    {new Date(order.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="font-medium mt-1">
                    {formatPrice(order.total, currency)}
                  </p>
                  <p className="text-sm text-muted mt-1">
                    {order.items.length}{' '}
                    {order.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
