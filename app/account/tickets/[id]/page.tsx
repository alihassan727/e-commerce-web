import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getMyCustomer, getMyTicket } from '@/lib/queries/account';
import { isUuid } from '@/lib/search';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
const CAT_LABEL: Record<string, string> = {
  order_issue: 'Order Issue',
  delivery_issue: 'Delivery Issue',
  payment_issue: 'Payment Issue',
  product_issue: 'Product Issue',
  return_exchange: 'Return / Exchange',
  other: 'Other',
};

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { submitted?: string };
}) {
  if (!isUuid(params.id)) notFound();
  const customer = await getMyCustomer();
  if (!customer) redirect(`/login?next=/account/tickets/${params.id}`);
  const ticket = await getMyTicket(params.id, customer.id);
  if (!ticket) notFound();

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Ticket {ticket.ticket_number}</h1>
        <Link href="/account/tickets" className="text-sm theme-text">Back to tickets</Link>
      </div>

      {searchParams.submitted === '1' && (
        <div className="border border-line dark:border-dark-line p-4 mb-6">
          <p className="font-medium text-ink dark:text-dark-ink">Ticket submitted.</p>
          <p className="text-sm text-muted dark:text-dark-muted mt-1">
            Our team will review your request and get back to you. Keep your ticket number for reference.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted dark:text-dark-muted">Status</p>
            <p className="font-medium text-ink dark:text-dark-ink mt-0.5">{STATUS_LABEL[ticket.status] ?? ticket.status}</p>
          </div>
          <div>
            <p className="text-muted dark:text-dark-muted">Category</p>
            <p className="text-ink dark:text-dark-ink mt-0.5">{CAT_LABEL[ticket.category] ?? ticket.category}</p>
          </div>
          <div>
            <p className="text-muted dark:text-dark-muted">Submitted</p>
            <p className="text-ink dark:text-dark-ink mt-0.5">{new Date(ticket.created_at).toLocaleString()}</p>
          </div>
          {ticket.order_id && (
            <div>
              <p className="text-muted dark:text-dark-muted">Related order</p>
              <Link href={`/account/orders/${ticket.order_id}`} className="theme-text mt-0.5">{ticket.order_id.slice(0, 8)}...</Link>
            </div>
          )}
        </div>
        <div>
          <p className="text-muted dark:text-dark-muted">Subject</p>
          <p className="font-medium text-ink dark:text-dark-ink mt-0.5">{ticket.subject}</p>
          <p className="text-muted dark:text-dark-muted mt-4">Description</p>
          <p className="text-ink dark:text-dark-ink mt-0.5 whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </div>
    </div>
  );
}
