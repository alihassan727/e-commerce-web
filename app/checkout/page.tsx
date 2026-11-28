import CheckoutForm from '@/components/checkout-form';
import { getSiteSettings } from '@/lib/queries/catalog';
import { getMyCustomer, getMyAddresses } from '@/lib/queries/account';
import { getSafepayConfig } from '@/lib/safepay/config';

export default async function CheckoutPage() {
  // Only the availability flag leaves the server; credentials stay server-side.
  const [settings, customer, safepayConfig] = await Promise.all([
    getSiteSettings(),
    getMyCustomer(),
    getSafepayConfig(),
  ]);

  // Saved addresses are only fetched for authenticated customers.
  const savedAddresses = customer ? await getMyAddresses(customer.id) : [];

  return (
    <CheckoutForm
      settings={settings}
      savedAddresses={savedAddresses}
      safepayAvailable={Boolean(safepayConfig)}
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
