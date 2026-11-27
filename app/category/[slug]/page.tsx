import { notFound } from 'next/navigation';
import Link from 'next/link';
import ProductCard from '@/components/product-card';
import {
  getActiveCategories,
  getCategoryBySlug,
  getProductsByCategory,
  getSiteSettings,
} from '@/lib/queries/catalog';

export default async function CategoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const [settings, category, categories] = await Promise.all([
    getSiteSettings(),
    getCategoryBySlug(slug),
    getActiveCategories(),
  ]);

  if (!category) notFound();
  const currency = settings?.currency ?? 'PKR';
  const products = await getProductsByCategory(category.id);

  return (
    <section className="container-page py-12 md:py-16">
      <div className="flex flex-wrap gap-2 mb-8 text-sm">
        <Link
          href="/shop"
          className="rounded-full border border-line dark:border-dark-line px-3.5 py-1.5 text-xs font-medium text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink hover:border-muted dark:hover:border-dark-muted transition-colors"
        >
          All
        </Link>
        {categories.map((c) => {
          const active = c.slug === slug;
          return (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'theme-border theme-text bg-surface dark:bg-dark-surface'
                  : 'border-line dark:border-dark-line text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink hover:border-muted dark:hover:border-dark-muted'
              }`}
            >
              {c.name}
            </Link>
          );
        })}
      </div>

      <div className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink dark:text-dark-ink">
          {category.name}
        </h1>
        <p className="text-sm text-muted dark:text-dark-muted mt-1">
          {products.length} {products.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {products.length === 0 ? (
        <div className="border border-line dark:border-dark-line rounded-lg p-12 text-center bg-surface dark:bg-dark-surface">
          <p className="text-sm text-muted dark:text-dark-muted">No items in this category yet.</p>
          <Link href="/shop" className="btn btn-outline mt-4">
            Browse all products
          </Link>
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
