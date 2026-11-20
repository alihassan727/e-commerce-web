'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { createOrder } from '@/lib/actions/orders';
import { formatPrice } from '@/lib/format';
import type { SiteSettings } from '@/lib/types';

export default function CheckoutForm({
  settings,
}: {
  settings: SiteSettings | null;
}) {
  const { items, subtotal, clear } = useCart();
  const router = useRouter();
  const currency = settings?.currency ?? 'PKR';
  const deliveryFee = Number(settings?.delivery_fee ?? 0);
  const deliveryAreas = (settings?.delivery_areas as string[]) ?? [];
  const total = subtotal + deliveryFee;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const result = await createOrder({
      items: items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      })),
      customer: {
        name: String(fd.get('name') ?? ''),
        email: String(fd.get('email') ?? ''),
        phone: String(fd.get('phone') ?? ''),
        alternate_phone: String(fd.get('alternate_phone') ?? ''),
        address: String(fd.get('address') ?? ''),
        city: String(fd.get('city') ?? ''),
        delivery_instructions: String(fd.get('delivery_instructions') ?? ''),
        preferred_delivery_time: String(fd.get('preferred_delivery_time') ?? ''),
      },
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clear();
    const next = `/order/${result.orderId}?placed=1&email=${encodeURIComponent(result.email)}`;
    router.push(next);
  }

  if (items.length === 0) {
    return (
      <div className="container-page py-16">
        <h1 className="font-serif text-3xl mb-4">Checkout</h1>
        <p className="text-muted">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div className="container-page py-12 grid grid-cols-1 md:grid-cols-2 gap-12">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h1 className="font-serif text-3xl mb-2">Checkout</h1>
        <p className="text-sm text-muted">
          Cash on delivery. No payment needed now. We confirm stock and email you.
        </p>

        {error && <p className="text-sm text-clay">{error}</p>}

        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" className="input" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className="input" required autoComplete="tel" />
          </div>
          <div className="field">
            <label htmlFor="alternate_phone">Alternate phone</label>
            <input id="alternate_phone" name="alternate_phone" className="input" autoComplete="tel" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="address">Shipping address</label>
          <textarea id="address" name="address" className="input" rows={3} required autoComplete="street-address" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="city">City</label>
            {deliveryAreas.length > 0 ? (
              <select id="city" name="city" className="input" required defaultValue="">
                <option value="" disabled>Select city</option>
                {deliveryAreas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <input id="city" name="city" className="input" required autoComplete="address-level2" />
            )}
          </div>
          <div className="field">
            <label htmlFor="preferred_delivery_time">Preferred delivery time</label>
            <input id="preferred_delivery_time" name="preferred_delivery_time" className="input" placeholder="e.g. weekdays after 5pm" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="delivery_instructions">Delivery instructions</label>
          <textarea id="delivery_instructions" name="delivery_instructions" className="input" rows={2} />
        </div>

        <button type="submit" className="btn btn-primary mt-2" disabled={submitting}>
          {submitting ? 'Placing order' : 'Place order'}
        </button>
      </form>

      <aside className="md:border-l md:border-line md:pl-12">
        <h2 className="font-serif text-2xl mb-6">Order summary</h2>
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={`${item.product_id}-${item.variant_id ?? 'simple'}`}
              className="flex justify-between text-sm"
            >
              <span>
                {item.title}
                {item.variant_label ? ` (${item.variant_label})` : null} x{item.quantity}
              </span>
              <span>{formatPrice(item.price * item.quantity, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="divider mt-6 pt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span>{formatPrice(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span>{formatPrice(deliveryFee, currency)}</span>
          </div>
          <div className="flex justify-between text-base font-medium pt-2">
            <span>Total</span>
            <span>{formatPrice(total, currency)}</span>
          </div>
        </div>
        {settings?.cod_notes && (
          <p className="text-sm text-muted mt-6">{settings.cod_notes}</p>
        )}
      </aside>
    </div>
  );
}
