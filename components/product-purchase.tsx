'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart-context';
import { formatPrice } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';

export default function ProductPurchase({
  product,
  currency,
}: {
  product: ProductDetail;
  currency: string;
}) {
  const { add } = useCart();
  const variants = product.variants ?? [];
  const hasVariants = product.has_variants && variants.length > 0;

  const [variantId, setVariantId] = useState<string>(
    hasVariants ? variants[0].id : '',
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = hasVariants ? variants.find((v) => v.id === variantId) ?? null : null;
  const stock = hasVariants ? selected?.stock ?? 0 : product.stock ?? 0;
  const outOfStock = stock <= 0;

  function addToCart() {
    if (outOfStock || (hasVariants && !selected)) return;
    add({
      product_id: product.id,
      variant_id: selected ? selected.id : null,
      title: product.title,
      slug: product.slug,
      variant_label: selected
        ? [selected.size, selected.color].filter(Boolean).join(' / ')
        : null,
      price: product.price,
      quantity: qty,
    });
    setAdded(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted">
          {product.category?.name ?? 'Clothing'}
        </p>
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-1">
          {product.title}
        </h1>
        <p className="mt-2 text-xl">{formatPrice(product.price, currency)}</p>
      </div>

      {product.description && (
        <p className="text-ink max-w-prose">{product.description}</p>
      )}

      {hasVariants && (
        <div className="field">
          <label htmlFor="variant">Variant</label>
          <select
            id="variant"
            className="input"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {variants.map((v) => {
              const label = [v.size, v.color].filter(Boolean).join(' / ');
              return (
                <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                  {label} {v.stock <= 0 ? '(out of stock)' : `(${v.stock} in stock)`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="qty">Quantity</label>
        <input
          id="qty"
          type="number"
          className="input w-28"
          min={1}
          max={outOfStock ? 1 : Math.max(1, stock)}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          disabled={outOfStock}
        />
      </div>

      <p className="text-sm text-muted">
        {outOfStock
          ? 'Out of stock'
          : hasVariants
            ? `${stock} in stock for this variant`
            : `${stock} in stock`}
      </p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={addToCart}
          disabled={outOfStock}
        >
          Add to cart
        </button>
        {added && (
          <span className="text-sm text-muted">Added to your cart.</span>
        )}
      </div>

      <p className="text-sm text-muted">Cash on delivery at checkout.</p>
    </div>
  );
}
