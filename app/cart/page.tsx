import CartView from '@/components/cart-view';
import { getSiteSettings } from '@/lib/queries/catalog';

export default async function CartPage() {
  const settings = await getSiteSettings();
  return <CartView currency={settings?.currency ?? 'PKR'} />;
}
