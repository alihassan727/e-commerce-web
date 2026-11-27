import CheckoutForm from '@/components/checkout-form';
import { getSiteSettings } from '@/lib/queries/catalog';
import { getMyCustomer, getMyAddresses } from '@/lib/queries/account';

export default async function CheckoutPage() {
  const [settings, customer] = await Promise.all([
    getSiteSettings(),
    getMyCustomer(),
  ]);

  // Saved addresses are only fetched for authenticated customers.
  const savedAddresses = customer ? await getMyAddresses(customer.id) : [];

  return (
    <CheckoutForm
      settings={settings}
      savedAddresses={savedAddresses}
      customerProfile={
        customer
          ? {
              name: customer.name ?? '',
              email: customer.email,
              phone: customer.phone ?? '',
            }
          : null
      }
    />
  );
}
