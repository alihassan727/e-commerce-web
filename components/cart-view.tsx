'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart-context';
import { formatPrice } from '@/lib/format';

export default function CartView({ currency }: { currency: string }) {
  const { items, subtotal, setQty, remove } = useCart();

  if (items.length === 0) {
    return (
      <div className="container-page py-16">
        <h1 className="font-serif text-3xl mb-4">Your cart</h1>
        <p className="text-muted">Your cart is empty.</p>
        <div className="mt-6">
          <Link href="/shop" className="btn btn-outline">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <h1 className="font-serif text-3xl mb-8">Your cart</h1>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div
            key={`${item.product_id}-${item.variant_id ?? 'simple'}`}
            className="flex items-start justify-between gap-4 border-b border-line pb-4"
          >
            <div className="flex-1">
              <Link href={`/product/${item.slug}`} className="font-medium">
                {item.title}
              </Link>
              {item.variant_label && (
                <p className="text-sm text-muted">{item.variant_label}</p>
              )}
              <p className="text-sm text-muted mt-1">
                {formatPrice(item.price, currency)} each
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center border border-line">
                  <button
                    type="button"
                    className="px-3 py-1"
                    onClick={() =>
                      setQty(item.product_id, item.variant_id, item.quantity - 1)
                    }
                    aria-label="Decrease quantity"
                  >
                    minus
                  </button>
                  <span className="px-3 py-1 text-sm w-10 text-center">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-1"
                    onClick={() =>
                      setQty(item.product_id, item.variant_id, item.quantity + 1)
                    }
                    aria-label="Increase quantity"
                  >
                    plus
                  </button>
                </div>
                <button
                  type="button"
                  className="text-sm text-muted"
                  onClick={() => remove(item.product_id, item.variant_id)}
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">
                {formatPrice(item.price * item.quantity, currency)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-muted">Subtotal</p>
        <p className="text-xl">{formatPrice(subtotal, currency)}</p>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <Link href="/checkout" className="btn btn-primary">
          Proceed to checkout
        </Link>
        <Link href="/shop" className="text-sm text-muted">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
