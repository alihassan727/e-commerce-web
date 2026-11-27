import Link from 'next/link';
import ProductImage from '@/components/product-image';
import { adminListProducts } from '@/lib/queries/admin';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AdminProductsPage() {
  const [products, settings] = await Promise.all([
    adminListProducts(),
    getSiteSettings(),
  ]);
  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="border border-line dark:border-dark-line p-8 text-center">
          <p className="text-sm text-muted dark:text-dark-muted">No products yet.</p>
          <Link href="/admin/products/new" className="btn btn-primary mt-4">Add your first product</Link>
        </div>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {/* Header row — hidden on small screens */}
          <div className="hidden md:grid grid-cols-[3rem_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 text-xs text-muted dark:text-dark-muted border-b border-line dark:border-dark-line">
            <span></span>
            <span>Product</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span></span>
          </div>

          {products.map((p) => {
            const thumb =
              [...(p.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
                ?.storage_path ?? null;

            return (
              <div
                key={p.id}
                className="grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 border-b border-line dark:border-dark-line last:border-0 items-center"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 border border-line dark:border-dark-line shrink-0 overflow-hidden">
                  <ProductImage
                    path={thumb}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Name + category */}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-ink dark:text-dark-ink truncate">{p.title}</p>
                  <p className="text-xs text-muted dark:text-dark-muted">{p.category_name ?? 'No category'}</p>
                </div>

                {/* Price */}
                <p className="hidden md:block text-sm text-ink dark:text-dark-ink">
                  {formatPrice(p.price, currency)}
                </p>

                {/* Stock */}
                <p className="hidden md:block text-sm text-muted dark:text-dark-muted">
                  {p.has_variants
                    ? `${p.color_count} color${p.color_count !== 1 ? 's' : ''} · ${p.variant_count} size${p.variant_count !== 1 ? 's' : ''}`
                    : `${p.stock ?? 0} units`}
                </p>

                {/* Status */}
                <p className="hidden md:block text-xs text-muted dark:text-dark-muted">
                  <span className={`border px-1.5 py-0.5 ${p.is_active ? 'theme-border theme-text' : 'border-line dark:border-dark-line'}`}>
                    {p.is_active ? 'Active' : 'Hidden'}
                  </span>
                  {p.is_featured && (
                    <span className="ml-1 border border-line dark:border-dark-line px-1.5 py-0.5 text-muted dark:text-dark-muted">
                      Featured
                    </span>
                  )}
                </p>

                {/* Actions */}
                <Link
                  href={`/admin/products/${p.id}`}
                  className="text-sm theme-text whitespace-nowrap"
                >
                  Edit
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
