'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { createOrder } from '@/lib/actions/orders';
import { saveAddress } from '@/lib/actions/account';
import { formatPrice } from '@/lib/format';
import type { CustomerAddress, SiteSettings } from '@/lib/types';

type AddressMode = 'saved' | 'new';

interface CustomerProfile {
  name: string;
  email: string;
  phone: string;
}

export default function CheckoutForm({
  settings,
  savedAddresses = [],
  customerProfile = null,
}: {
  settings: SiteSettings | null;
  savedAddresses?: CustomerAddress[];
  customerProfile?: CustomerProfile | null;
}) {
  const { items, subtotal, clear } = useCart();
  const router = useRouter();
  const currency = settings?.currency ?? 'PKR';
  const deliveryFee = Number(settings?.delivery_fee ?? 0);
  const deliveryAreas = (settings?.delivery_areas as string[]) ?? [];
  const total = subtotal + deliveryFee;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Address mode: 'saved' when the customer has saved addresses, 'new' otherwise
  const hasSavedAddresses = savedAddresses.length > 0;
  const [addressMode, setAddressMode] = useState<AddressMode>(
    hasSavedAddresses ? 'saved' : 'new',
  );
  const defaultAddr = savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    defaultAddr?.id ?? '',
  );
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    // Resolve delivery details from either the saved address or the form.
    let deliveryName: string;
    let deliveryEmail: string;
    let deliveryPhone: string;
    let deliveryAddress: string;
    let deliveryCity: string;
    let deliveryAltPhone: string;
    let deliveryInstructions: string;
    let deliveryTime: string;

    if (addressMode === 'saved' && selectedAddressId) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (!addr) {
        setError('Selected address not found. Please choose another.');
        setSubmitting(false);
        return;
      }
      deliveryName         = addr.full_name;
      deliveryEmail        = customerProfile?.email ?? String(fd.get('email') ?? '');
      deliveryPhone        = addr.phone ?? customerProfile?.phone ?? '';
      deliveryAddress      = addr.address;
      deliveryCity         = addr.city;
      deliveryAltPhone     = String(fd.get('alternate_phone') ?? '');
      deliveryInstructions = String(fd.get('delivery_instructions') ?? '');
      deliveryTime         = String(fd.get('preferred_delivery_time') ?? '');
    } else {
      deliveryName         = String(fd.get('name') ?? '');
      deliveryEmail        = String(fd.get('email') ?? '');
      deliveryPhone        = String(fd.get('phone') ?? '');
      deliveryAddress      = String(fd.get('address') ?? '');
      deliveryCity         = String(fd.get('city') ?? '');
      deliveryAltPhone     = String(fd.get('alternate_phone') ?? '');
      deliveryInstructions = String(fd.get('delivery_instructions') ?? '');
      deliveryTime         = String(fd.get('preferred_delivery_time') ?? '');

      // Optionally save the new address to the customer's account.
      if (saveNewAddress && customerProfile) {
        await saveAddress({
          label: 'Home',
          full_name: deliveryName,
          phone: deliveryPhone,
          address: deliveryAddress,
          city: deliveryCity,
          postal_code: '',
          is_default: savedAddresses.length === 0,
        }).catch(() => {
          // Non-fatal: order proceeds even if address save fails.
        });
      }
    }

    const result = await createOrder({
      items: items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      })),
      customer: {
        name:                    deliveryName,
        email:                   deliveryEmail,
        phone:                   deliveryPhone,
        alternate_phone:         deliveryAltPhone,
        address:                 deliveryAddress,
        city:                    deliveryCity,
        delivery_instructions:   deliveryInstructions,
        preferred_delivery_time: deliveryTime,
      },
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clear();
    router.push(
      `/order/${result.orderId}?placed=1&email=${encodeURIComponent(result.email)}`,
    );
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

        {error && <p className="text-sm theme-text">{error}</p>}

        {/* ---- Delivery address ---- */}
        {hasSavedAddresses && (
          <div className="border border-line dark:border-dark-line p-4 flex flex-col gap-3">
            <p className="font-medium text-sm text-ink dark:text-dark-ink">Delivery address</p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addr_mode"
                  checked={addressMode === 'saved'}
                  onChange={() => setAddressMode('saved')}
                />
                Use saved address
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addr_mode"
                  checked={addressMode === 'new'}
                  onChange={() => setAddressMode('new')}
                />
                Enter a new address
              </label>
            </div>

            {addressMode === 'saved' && (
              <div className="flex flex-col gap-2">
                {savedAddresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`flex items-start gap-3 p-3 border cursor-pointer ${
                      selectedAddressId === addr.id
                        ? 'theme-border'
                        : 'border-line dark:border-dark-line'
                    }`}
                  >
                    <input
                      type="radio"
                      name="saved_address"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={() => setSelectedAddressId(addr.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <p className="font-medium text-ink dark:text-dark-ink">{addr.full_name}</p>
                      <p className="text-muted dark:text-dark-muted">{addr.address}, {addr.city}</p>
                      {addr.phone && (
                        <p className="text-muted dark:text-dark-muted">{addr.phone}</p>
                      )}
                      {addr.is_default && (
                        <span className="text-xs theme-text">Default</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Contact info (always shown when using saved address so email can be supplied) ---- */}
        {addressMode === 'saved' && hasSavedAddresses ? (
          <div className="flex flex-col gap-3">
            {!customerProfile?.email && (
              <div className="field">
                <label htmlFor="email">Email for confirmation</label>
                <input id="email" name="email" type="email" className="input" required autoComplete="email" />
              </div>
            )}
            <div className="field">
              <label htmlFor="alternate_phone">Alternate phone (optional)</label>
              <input id="alternate_phone" name="alternate_phone" className="input" autoComplete="tel" />
            </div>
            <div className="field">
              <label htmlFor="preferred_delivery_time">Preferred delivery time</label>
              <input id="preferred_delivery_time" name="preferred_delivery_time" className="input" placeholder="e.g. weekdays after 5pm" />
            </div>
            <div className="field">
              <label htmlFor="delivery_instructions">Delivery instructions</label>
              <textarea id="delivery_instructions" name="delivery_instructions" className="input" rows={2} />
            </div>
          </div>
        ) : (
          /* ---- Full address form for new address ---- */
          <div className="flex flex-col gap-3">
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" name="name" className="input" required autoComplete="name"
                defaultValue={customerProfile?.name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" required autoComplete="email"
                defaultValue={customerProfile?.email ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input id="phone" name="phone" className="input" required autoComplete="tel"
                  defaultValue={customerProfile?.phone ?? ''} />
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

            {/* Save address option (only shown for authenticated customers) */}
            {customerProfile && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewAddress}
                  onChange={(e) => setSaveNewAddress(e.target.checked)}
                />
                Save this address to my account
              </label>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary mt-2" disabled={submitting}>
          {submitting ? 'Placing order' : 'Place order'}
        </button>
      </form>

      {/* ---- Order summary ---- */}
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
