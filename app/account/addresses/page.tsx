import { getMyCustomer, getMyAddresses } from '@/lib/queries/account';
import AddressBook from './client';

export default async function AddressesPage() {
  const customer = await getMyCustomer();
  if (!customer) return null;
  const addresses = await getMyAddresses(customer.id);
  return <AddressBook customerId={customer.id} initialAddresses={addresses} />;
}
