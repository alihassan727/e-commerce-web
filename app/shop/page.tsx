import Link from 'next/link';
import ProductCard from '@/components/product-card';
import {
  getActiveCategories,
  getAllProducts,
  getSiteSettings,
} from '@/lib/queries/catalog';

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const [settings, allProducts, categories] = await Promise.all([
    getSiteSettings(),
    getAllProducts(),
    getActiveCategories(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const query = searchParams?.q?.trim() ?? '';
  const qLower = query.toLowerCase();

  const products = qLower
    ? allProducts.filter(
        (p) =>
          p.title.toLowerCase().includes(qLower) ||
          (p.description ?? '').toLowerCase().includes(qLower),
      )
    : allProducts;

  return (
    <section className="container-page py-12 md:py-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink dark:text-dark-ink">
            {query ? `Search: "${query}"` : 'All products'}
          </h1>
          <p className="text-sm text-muted dark:text-dark-muted mt-1">
            {products.length} {products.length === 1 ? 'item' : 'items'}
          </p>
        </div>

        {query && (
          <Link href="/shop" className="text-sm theme-text hover:underline underline-offset-4">
            Clear search
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-10 text-sm">
        <Link
          href="/shop"
          className="rounded-full border px-3.5 py-1.5 text-xs font-medium theme-border theme-text bg-surface dark:bg-dark-surface"
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className="rounded-full border border-line dark:border-dark-line px-3.5 py-1.5 text-xs font-medium text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink hover:border-muted dark:hover:border-dark-muted transition-colors"
          >
            {c.name}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="border border-line dark:border-dark-line rounded-lg p-12 text-center bg-surface dark:bg-dark-surface">
          <p className="text-sm text-muted dark:text-dark-muted">
            {query ? `No products matched "${query}".` : 'No products yet.'}
          </p>
          {query && (
            <Link href="/shop" className="btn btn-outline mt-4">
              Browse all products
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}
