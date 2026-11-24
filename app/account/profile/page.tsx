import { getMyCustomer } from '@/lib/queries/account';
import { ProfileClientForm } from './client';

export default async function ProfilePage() {
  const customer = await getMyCustomer();
  return (
    <ProfileClientForm
      initialData={{
        name: customer?.name ?? '',
        phone: customer?.phone ?? '',
        address: customer?.address ?? '',
        city: customer?.city ?? '',
        postal_code: customer?.postal_code ?? '',
      }}
    />
  );
}
