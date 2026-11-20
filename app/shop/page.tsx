import Link from 'next/link';
import ProductCard from '@/components/product-card';
import {
  getActiveCategories,
  getAllProducts,
  getSiteSettings,
} from '@/lib/queries/catalog';

export default async function ShopPage() {
  const [settings, products, categories] = await Promise.all([
    getSiteSettings(),
    getAllProducts(),
    getActiveCategories(),
  ]);
  const currency = settings?.currency ?? 'PKR';

  return (
    <section className="container-page py-12">
      <h1 className="font-serif text-3xl md:text-4xl mb-2">All products</h1>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-8 text-sm">
        <Link href="/shop" className="text-clay">All</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`} className="text-muted">
            {c.name}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted">No products yet.</p>
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
