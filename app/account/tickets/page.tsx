import Link from 'next/link';
import { getMyCustomer, getMyTickets } from '@/lib/queries/account';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default async function TicketsPage() {
  const customer = await getMyCustomer();
  if (!customer) return null;
  const tickets = await getMyTickets(customer.id);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Support tickets</h1>
        <Link href="/account/tickets/new" className="btn btn-primary">New ticket</Link>
      </div>

      {tickets.length === 0 ? (
        <div className="border border-line dark:border-dark-line p-8 text-center">
          <p className="text-muted dark:text-dark-muted text-sm">No tickets submitted yet.</p>
          <Link href="/account/tickets/new" className="btn btn-outline mt-4">Submit a ticket</Link>
        </div>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/account/tickets/${t.id}`}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
            >
              <div>
                <p className="font-medium text-ink dark:text-dark-ink">{t.ticket_number}</p>
                <p className="text-muted dark:text-dark-muted">{t.subject}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted dark:text-dark-muted">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
                <span className="border border-line dark:border-dark-line px-2 py-0.5 text-xs text-ink dark:text-dark-ink">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
