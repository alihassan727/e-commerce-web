import Link from 'next/link';
import { adminListTickets } from '@/lib/queries/account';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
};
const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'resolved', 'closed'];

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const tickets = await adminListTickets({ status: searchParams.status, search: searchParams.q });
  const current = searchParams.status ?? 'all';

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Support tickets</h1>

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" className="input" defaultValue={searchParams.q ?? ''} placeholder="Ticket ID, name or email" />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={current}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All' : STATUS_LABEL[s] ?? s}</option>
            ))}
          </select>
        </div>
        <div className="field justify-end">
          <label>&nbsp;</label>
          <button type="submit" className="btn btn-outline">Filter</button>
        </div>
      </form>

      {tickets.length === 0 ? (
        <p className="text-muted dark:text-dark-muted text-sm">No tickets match.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/admin/tickets/${t.id}`}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
            >
              <div>
                <p className="font-medium text-ink dark:text-dark-ink">{t.ticket_number}</p>
                <p className="text-muted dark:text-dark-muted">{t.customer_name} · {t.email}</p>
                <p className="text-muted dark:text-dark-muted">{t.subject}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted dark:text-dark-muted">{new Date(t.created_at).toLocaleDateString()}</span>
                <span className="border border-line dark:border-dark-line px-2 py-0.5 text-xs">{STATUS_LABEL[t.status] ?? t.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
