import Link from 'next/link';
import { adminListCustomers } from '@/lib/queries/admin';

export default async function AdminCustomersPage() {
  const customers = await adminListCustomers();

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Customers</h1>

      {customers.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No customers yet. Customers appear here when they create an account.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/admin/customers/${c.id}`}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
            >
              <span>
                {c.name || '(no name)'} · {c.email}
              </span>
              <span className="text-muted dark:text-dark-muted">
                {c.order_count} {c.order_count === 1 ? 'order' : 'orders'} ·{' '}
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
