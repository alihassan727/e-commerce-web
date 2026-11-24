import { getMyCustomer } from '@/lib/queries/account';
import NewTicketForm from './client';

export default async function NewTicketPage() {
  const customer = await getMyCustomer();
  if (!customer) return null;
  return (
    <NewTicketForm
      customerName={customer.name ?? ''}
      customerEmail={customer.email}
      customerPhone={customer.phone ?? ''}
    />
  );
}
