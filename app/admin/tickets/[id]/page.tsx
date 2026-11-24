import { notFound } from 'next/navigation';
import Link from 'next/link';
import AdminTicketDetail from './client';
import { adminGetTicket } from '@/lib/queries/account';

const CAT_LABEL: Record<string, string> = {
  order_issue: 'Order Issue', delivery_issue: 'Delivery Issue', payment_issue: 'Payment Issue',
  product_issue: 'Product Issue', return_exchange: 'Return / Exchange', other: 'Other',
};

export default async function AdminTicketPage({ params }: { params: { id: string } }) {
  const result = await adminGetTicket(params.id);
  if (!result) notFound();
  const { ticket, notes } = result;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Ticket {ticket.ticket_number}</h1>
        <Link href="/admin/tickets" className="text-sm theme-text">Back to tickets</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="text-sm flex flex-col gap-3">
          <div>
            <p className="text-muted dark:text-dark-muted">Customer</p>
            <p className="text-ink dark:text-dark-ink font-medium">{ticket.customer_name}</p>
            <p className="text-muted dark:text-dark-muted">{ticket.email}</p>
            {ticket.phone && <p className="text-muted dark:text-dark-muted">{ticket.phone}</p>}
          </div>
          <div>
            <p className="text-muted dark:text-dark-muted">Category</p>
            <p className="text-ink dark:text-dark-ink">{CAT_LABEL[ticket.category] ?? ticket.category}</p>
          </div>
          {ticket.order_id && (
            <div>
              <p className="text-muted dark:text-dark-muted">Related order</p>
              <Link href={`/admin/orders/${ticket.order_id}`} className="theme-text">{ticket.order_id.slice(0, 8)}...</Link>
            </div>
          )}
          <div>
            <p className="text-muted dark:text-dark-muted">Submitted</p>
            <p className="text-ink dark:text-dark-ink">{new Date(ticket.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="text-sm">
          <p className="text-muted dark:text-dark-muted">Subject</p>
          <p className="font-medium text-ink dark:text-dark-ink mb-3">{ticket.subject}</p>
          <p className="text-muted dark:text-dark-muted">Description</p>
          <p className="text-ink dark:text-dark-ink whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </div>

      <AdminTicketDetail ticketId={ticket.id} currentStatus={ticket.status} notes={notes} />
    </div>
  );
}
