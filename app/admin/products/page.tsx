import Link from 'next/link';
import ProductImage from '@/components/product-image';
import AdminProductDelete from '@/components/admin-product-delete';
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
        <div className="flex flex-col gap-3">
          {products.map((p) => {
            const stockLabel = p.has_variants
              ? `${p.color_count} color${p.color_count === 1 ? '' : 's'} · ${p.variant_count} size${p.variant_count === 1 ? '' : 's'}`
              : `${p.stock ?? 0} in stock`;

            return (
              <div
                key={p.id}
                className="border border-line dark:border-dark-line p-3 sm:p-4 flex gap-3 sm:gap-4"
              >
                {/* Square thumbnail — uses the same image precedence as the storefront */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden border border-line dark:border-dark-line bg-surface dark:bg-dark-surface">
                  <ProductImage
                    path={p.thumbnail_path}
                    alt={p.title}
                    className="w-full h-full object-cover"
                    sizes="80px"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium text-sm text-ink dark:text-dark-ink break-words">
                      {p.title}
                    </p>
                    <span
                      className={`border px-1.5 py-0.5 text-[11px] ${
                        p.is_active
                          ? 'theme-border theme-text'
                          : 'border-line dark:border-dark-line text-muted dark:text-dark-muted'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Hidden'}
                    </span>
                    {p.is_featured && (
                      <span className="border border-line dark:border-dark-line px-1.5 py-0.5 text-[11px] text-muted dark:text-dark-muted">
                        Featured
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted dark:text-dark-muted">
                    <span className="text-sm text-ink dark:text-dark-ink">
                      {formatPrice(p.price, currency)}
                    </span>
                    <span>{p.category_name ?? 'No category'}</span>
                    <span>{stockLabel}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 shrink-0 text-sm">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="theme-text whitespace-nowrap"
                  >
                    Edit
                  </Link>
                  <AdminProductDelete id={p.id} title={p.title} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
