import CheckoutForm from '@/components/checkout-form';
import { getSiteSettings } from '@/lib/queries/catalog';

export default async function CheckoutPage() {
  const settings = await getSiteSettings();
  return <CheckoutForm settings={settings} />;
}
