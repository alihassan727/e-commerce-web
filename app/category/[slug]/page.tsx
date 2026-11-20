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
    <section className="container-page py-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-8 text-sm">
        <Link href="/shop" className="text-muted">All</Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className={c.slug === slug ? 'text-clay' : 'text-muted'}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <h1 className="font-serif text-3xl md:text-4xl mb-8">{category.name}</h1>

      {products.length === 0 ? (
        <p className="text-sm text-muted">No items in this category yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}
