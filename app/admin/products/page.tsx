import Link from 'next/link';
import { adminListProducts } from '@/lib/queries/admin';
import { getActiveCategories } from '@/lib/queries/catalog';
import { getSiteSettings } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/format';

export default async function AdminProductsPage() {
  const [products, categories, settings] = await Promise.all([
    adminListProducts(),
    getActiveCategories(),
    getSiteSettings(),
  ]);
  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted">No products yet.</p>
      ) : (
        <div className="border border-line">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 text-sm text-muted border-b border-line">
            <span>Title</span>
            <span>Category</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span></span>
          </div>
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/admin/products/${p.id}`}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-line last:border-0 text-sm items-center"
            >
              <span>{p.title}</span>
              <span className="text-muted">{p.category_name ?? 'None'}</span>
              <span>{formatPrice(p.price, currency)}</span>
              <span className="text-muted">
                {p.has_variants ? `${p.variant_count} variants` : `${p.stock ?? 0} units`}
              </span>
              <span className="text-muted">
                {p.is_active ? 'Active' : 'Hidden'}
                {p.is_featured ? ' · Featured' : ''}
              </span>
              <span className="theme-text">Edit</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
