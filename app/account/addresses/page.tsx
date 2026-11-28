import { redirect } from 'next/navigation';
import { getMyCustomer, getMyAddresses } from '@/lib/queries/account';
import AddressBook from './client';

export default async function AddressesPage() {
  const customer = await getMyCustomer();
  if (!customer) redirect('/login?next=/account/addresses');
  const addresses = await getMyAddresses(customer.id);
  return <AddressBook initialAddresses={addresses} />;
}
