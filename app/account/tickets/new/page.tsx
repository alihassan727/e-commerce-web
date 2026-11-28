import { redirect } from 'next/navigation';
import { getMyCustomer } from '@/lib/queries/account';
import NewTicketForm from './client';

export default async function NewTicketPage() {
  const customer = await getMyCustomer();
  if (!customer) redirect('/login?next=/account/tickets/new');
  return (
    <NewTicketForm
      customerName={customer.name ?? ''}
      customerEmail={customer.email}
      customerPhone={customer.phone ?? ''}
    />
  );
}
