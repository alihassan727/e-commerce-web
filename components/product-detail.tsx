'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { formatPrice } from '@/lib/format';
import { getEffectivePrice, hasSale } from '@/lib/pricing';
import { getStorageUrl } from '@/lib/storage';
import ProductGallery from '@/components/product-gallery';
import type { CartItem, ProductDetail, Variant } from '@/lib/types';

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Active variants belonging to a color (linked by id or legacy name). */
function variantsForColor(
  product: ProductDetail,
  color: { id: string; name: string } | null,
): Variant[] {
  if (!color) return [];
  return (product.variants ?? []).filter(
    (v) =>
      v.is_active &&
      (v.color_id === color.id ||
        (!v.color_id && normalize(v.color) === normalize(color.name))),
  );
}

/** Prefer an in-stock variant so the default selection is purchasable. */
function pickDefaultVariant(variants: Variant[]): Variant | null {
  return variants.find((v) => v.stock > 0) ?? variants[0] ?? null;
}

export default function ProductDetailView({
  product,
  currency,
}: {
  product: ProductDetail;
  currency: string;
}) {
  const { add } = useCart();
  const router = useRouter();

  const colors = useMemo(
    () =>
      [...(product.colors ?? [])]
        .filter((c) => c.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [product.colors],
  );
  const hasColors = product.has_variants && colors.length > 0;

  const [colorId, setColorId] = useState<string | null>(
    hasColors ? colors[0].id : null,
  );
  const selectedColor = hasColors
    ? colors.find((c) => c.id === colorId) ?? null
    : null;

  const colorVariants = useMemo(
    () => variantsForColor(product, selectedColor),
    [product, selectedColor],
  );

  const [variantId, setVariantId] = useState<string | null>(
    pickDefaultVariant(colorVariants)?.id ?? null,
  );
  const selectedVariant: Variant | null =
    colorVariants.find((v) => v.id === variantId) ??
    pickDefaultVariant(colorVariants);

  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Pricing: color-level is the source of truth.
  const regularPrice = selectedColor
    ? Number(selectedColor.regular_price)
    : Number(product.price);
  const salePrice = selectedColor ? selectedColor.sale_price : null;
  const price = selectedColor
    ? getEffectivePrice(selectedColor.regular_price, selectedColor.sale_price)
    : Number(product.price);
  const onSale = selectedColor
    ? hasSale(selectedColor.regular_price, selectedColor.sale_price)
    : false;

  const stock = hasColors
    ? selectedVariant?.stock ?? 0
    : product.stock ?? 0;
  const outOfStock = stock <= 0;

  // Gallery images for the active color, falling back to product-level images
  // when the color has no gallery of its own.
  const productGallery = [...(product.images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const colorGallery = selectedColor
    ? [...(selectedColor.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const galleryImages = colorGallery.length > 0 ? colorGallery : productGallery;

  const firstColorImage = selectedColor
    ? [...(selectedColor.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
        ?.storage_path ?? null
    : null;
  const firstProductImage =
    [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
      ?.storage_path ?? null;
  const imagePath = firstColorImage ?? firstProductImage;

  function buildCartItem(): CartItem {
    const colorName = selectedColor?.name ?? null;
    const size = selectedVariant?.size ?? null;
    const variantLabel = hasColors
      ? [size, colorName].filter(Boolean).join(' / ') || null
      : null;
    return {
      product_id: product.id,
      color_id: selectedColor?.id ?? null,
      variant_id: hasColors ? selectedVariant?.id ?? null : null,
      title: selectedColor?.title?.trim() || product.title,
      slug: product.slug,
      color_name: colorName,
      color_hex: selectedColor?.color_hex ?? null,
      size,
      variant_label: variantLabel,
      image_url: imagePath ? getStorageUrl('product-images', imagePath) : null,
      price,
      quantity: qty,
    };
  }

  // Never add more than the variant actually has in stock.
  function withStockLimit(item: CartItem): CartItem {
    return { ...item, quantity: Math.min(item.quantity, Math.max(1, stock)) };
  }

  function addToCart() {
    if (outOfStock) return;
    if (hasColors && !selectedVariant) return;
    add(withStockLimit(buildCartItem()));
    setAdded(true);
  }

  function buyNow() {
    if (outOfStock) return;
    if (hasColors && !selectedVariant) return;
    add(withStockLimit(buildCartItem()));
    router.push('/checkout');
  }

  function selectColor(id: string) {
    setColorId(id);
    setAdded(false);
    const next = variantsForColor(product, colors.find((c) => c.id === id) ?? null);
    setVariantId(pickDefaultVariant(next)?.id ?? null);
  }

  const title = selectedColor?.title?.trim() || product.title;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
      <ProductGallery images={galleryImages} alt={title} />

      <div className="flex flex-col gap-5">
        <div>
          {product.category ? (
            <Link
              href={`/category/${product.category.slug}`}
              className="text-xs font-medium uppercase tracking-wider text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink"
            >
              {product.category.name}
            </Link>
          ) : (
            <p className="text-xs font-medium uppercase tracking-wider text-muted dark:text-dark-muted">
              Clothing
            </p>
          )}
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-1.5 text-ink dark:text-dark-ink">
            {title}
          </h1>
          <div className="mt-2.5 flex items-baseline gap-3">
            <span className="text-xl font-medium text-ink dark:text-dark-ink">
              {formatPrice(price, currency)}
            </span>
            {onSale && (
              <span className="text-sm text-muted dark:text-dark-muted line-through">
                {formatPrice(regularPrice, currency)}
              </span>
            )}
          </div>
        </div>

        {product.description && (
          <p className="text-sm md:text-base text-ink/85 dark:text-dark-ink/85 leading-relaxed max-w-prose">
            {product.description}
          </p>
        )}

        {hasColors && (
          <div className="field">
            <label>Color: <span className="text-ink dark:text-dark-ink font-medium">{selectedColor?.name}</span></label>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => {
                const active = c.id === colorId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectColor(c.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'theme-border bg-surface dark:bg-dark-surface text-ink dark:text-dark-ink font-medium'
                        : 'border-line dark:border-dark-line text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink'
                    }`}
                    aria-pressed={active}
                  >
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-line dark:border-dark-line"
                      style={{ backgroundColor: c.color_hex || 'transparent' }}
                      aria-hidden="true"
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasColors && colorVariants.length > 0 && (
          <div className="field">
            <label htmlFor="size">Size</label>
            <select
              id="size"
              className="input"
              value={selectedVariant?.id ?? ''}
              onChange={(e) => setVariantId(e.target.value)}
            >
              {colorVariants.map((v) => (
                <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                  {v.size || 'One size'} {v.stock <= 0 ? '(out of stock)' : `(${v.stock} in stock)`}
                </option>
              ))}
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
            onChange={(e) => {
              const next = Math.max(1, Math.floor(Number(e.target.value) || 1));
              setQty(stock > 0 ? Math.min(next, stock) : 1);
            }}
            disabled={outOfStock}
          />
        </div>

        <p className="text-sm text-muted dark:text-dark-muted">
          {outOfStock
            ? 'Out of stock'
            : hasColors
              ? `${stock} in stock for this size`
              : `${stock} in stock`}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" className="btn btn-outline" onClick={addToCart} disabled={outOfStock}>
            Add to cart
          </button>
          <button type="button" className="btn btn-primary" onClick={buyNow} disabled={outOfStock}>
            Buy now
          </button>
          {added && <span className="text-sm theme-text font-medium">Added to your cart.</span>}
        </div>

        <p className="text-xs text-muted dark:text-dark-muted">Cash on delivery at checkout.</p>
      </div>
    </div>
  );
}