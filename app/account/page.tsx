import Link from 'next/link';
import OrderStatusBadge from '@/components/order-status-badge';
import { getCurrentUser } from '@/lib/admin';
import { getMyCustomer, getMyStats, getMyOrders, getMyAddresses } from '@/lib/queries/account';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AccountDashboardPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSiteSettings()]);
  const currency = settings?.currency ?? 'PKR';
  const customer = await getMyCustomer();
  if (!customer) return null;

  const [stats, orders, addresses] = await Promise.all([
    getMyStats(customer.id),
    // Include guest orders placed with the same email, matching /account/orders.
    getMyOrders(customer.id, customer.email),
    getMyAddresses(customer.id),
  ]);

  const recentOrders = orders.slice(0, 5);
  const defaultAddr = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return (
    <div className="flex flex-col gap-10">
      {/* Welcome */}
      <div>
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">
          Welcome back, {customer.name ?? user?.email ?? 'there'}
        </h1>
        <p className="text-sm text-muted dark:text-dark-muted mt-1">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total orders', value: stats.total_orders },
          { label: 'Total spent', value: formatPrice(stats.total_spent, currency) },
          { label: 'Pending', value: stats.pending_orders },
          { label: 'Delivered', value: stats.delivered_orders },
        ].map((s) => (
          <div key={s.label} className="border border-line dark:border-dark-line p-4">
            <p className="text-sm text-muted dark:text-dark-muted">{s.label}</p>
            <p className="text-2xl font-serif mt-1 text-ink dark:text-dark-ink">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-ink dark:text-dark-ink">Recent orders</h2>
          <Link href="/account/orders" className="text-sm theme-text">View all</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="border border-line dark:border-dark-line p-8 text-center">
            <p className="text-muted dark:text-dark-muted">No orders yet.</p>
            <Link href="/shop" className="btn btn-primary mt-4">Shop now</Link>
          </div>
        ) : (
          <div className="border border-line dark:border-dark-line">
            {recentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/account/orders/${o.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
              >
                <span className="text-muted dark:text-dark-muted">
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
                <span className="font-medium text-ink dark:text-dark-ink">
                  {formatPrice(o.total, currency)}
                </span>
                <OrderStatusBadge status={o.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Default address */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-ink dark:text-dark-ink">Default address</h2>
          <Link href="/account/addresses" className="text-sm theme-text">Manage</Link>
        </div>
        {defaultAddr ? (
          <div className="border border-line dark:border-dark-line p-4 text-sm">
            <p className="font-medium text-ink dark:text-dark-ink">{defaultAddr.full_name}</p>
            <p className="text-muted dark:text-dark-muted">{defaultAddr.address}</p>
            <p className="text-muted dark:text-dark-muted">{defaultAddr.city}{defaultAddr.postal_code ? `, ${defaultAddr.postal_code}` : ''}</p>
            {defaultAddr.phone && <p className="text-muted dark:text-dark-muted">{defaultAddr.phone}</p>}
          </div>
        ) : (
          <div className="border border-line dark:border-dark-line p-6 text-center">
            <p className="text-muted dark:text-dark-muted text-sm">No saved addresses.</p>
            <Link href="/account/addresses" className="btn btn-outline mt-3">Add address</Link>
          </div>
        )}
      </section>

      {/* Quick links */}
      <section className="border-t border-line dark:border-dark-line pt-6">
        <div className="flex flex-wrap gap-3">
          <Link href="/account/profile" className="btn btn-ghost text-sm">Edit profile</Link>
          <Link href="/account/tickets/new" className="btn btn-ghost text-sm">Submit a ticket</Link>
          <Link href="/account/tickets" className="btn btn-ghost text-sm">View tickets</Link>
        </div>
      </section>
    </div>
  );
}
