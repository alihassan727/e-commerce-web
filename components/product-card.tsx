import Link from 'next/link';
import ProductImage from '@/components/product-image';
import { formatPrice } from '@/lib/format';
import type { ProductListItem } from '@/lib/types';

export default function ProductCard({
  product,
  currency,
}: {
  product: ProductListItem;
  currency: string;
}) {
  const sorted = [...(product.images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const first = sorted[0]?.storage_path ?? null;

  return (
    <Link href={`/product/${product.slug}`} className="block">
      <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-canvas">
        <ProductImage
          path={first}
          alt={product.title}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <h3 className="font-medium leading-snug">{product.title}</h3>
        <span className="text-sm text-muted whitespace-nowrap">
          {formatPrice(product.price, currency)}
        </span>
      </div>
    </Link>
  );
}
