import Link from 'next/link';
import ProductImage from '@/components/product-image';
import { formatPrice } from '@/lib/format';
import { getEffectivePrice, hasSale } from '@/lib/pricing';
import type { ProductListItem } from '@/lib/types';

export default function ProductCard({
  product,
  currency,
}: {
  product: ProductListItem;
  currency: string;
}) {
  const colors = [...(product.colors ?? [])]
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  let imagePath: string | null = null;
  let price = Number(product.price);
  let regular = Number(product.price);
  let onSale = false;
  let from = false;

  if (colors.length > 0) {
    const firstColor = colors[0];
    const colorImage = [...(firstColor.images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )[0];
    const productImage = [...(product.images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )[0];
    // Fall back to a product-level image when the first color has none.
    imagePath = colorImage?.storage_path ?? productImage?.storage_path ?? null;

    const prices = colors.map((c) => ({
      effective: getEffectivePrice(c.regular_price, c.sale_price),
      regular: Number(c.regular_price),
      sale: hasSale(c.regular_price, c.sale_price),
    }));
    // Show the cheapest effective price, and use that same color's regular
    // price for the strike-through so the two numbers always correspond.
    let cheapest = prices[0];
    for (const p of prices) {
      if (p.effective < cheapest.effective) cheapest = p;
    }
    price = cheapest.effective;
    regular = cheapest.regular;
    onSale = cheapest.sale;
    from = new Set(prices.map((p) => p.effective)).size > 1;
  } else {
    const sorted = [...(product.images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    imagePath = sorted[0]?.storage_path ?? null;
  }

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-line dark:border-dark-line bg-surface dark:bg-dark-surface transition-colors group-hover:border-muted dark:group-hover:border-dark-muted">
        <ProductImage
          path={imagePath}
          alt={product.title}
          className="w-full h-full object-cover"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {onSale && (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-canvas/95 dark:bg-dark-canvas/95 border border-line dark:border-dark-line px-2.5 py-0.5 text-[11px] font-medium tracking-wide theme-text">
            Sale
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug text-ink dark:text-dark-ink group-hover:underline underline-offset-4">
            {product.title}
          </h3>
          <span className="text-sm text-ink dark:text-dark-ink whitespace-nowrap text-right font-medium">
            {from ? 'From ' : ''}
            {formatPrice(price, currency)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 min-h-[1.125rem]">
          {colors.length > 0 ? (
            <div className="flex items-center gap-1.5" aria-label={`${colors.length} colors available`}>
              {colors.slice(0, 4).map((c) => (
                <span
                  key={c.id}
                  className="inline-block w-3 h-3 rounded-full border border-line dark:border-dark-line"
                  style={{ backgroundColor: c.color_hex || '#D9D2C7' }}
                  title={c.name}
                />
              ))}
              {colors.length > 4 && (
                <span className="text-[11px] text-muted dark:text-dark-muted">
                  +{colors.length - 4}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}

          {onSale && (
            <span className="line-through text-xs text-muted dark:text-dark-muted">
              {formatPrice(regular, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
