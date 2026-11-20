import Link from 'next/link';
import ProductCard from '@/components/product-card';
import {
  getActiveCategories,
  getHomepageSections,
  getProductsByCategory,
  getProductsByIds,
  getSiteSettings,
} from '@/lib/queries/catalog';
import type { HomepageSection, ProductListItem } from '@/lib/types';

export default async function Home() {
  const [settings, sections, categories] = await Promise.all([
    getSiteSettings(),
    getHomepageSections(),
    getActiveCategories(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const categorySlug: Record<string, string> = Object.fromEntries(
    categories.map((c) => [c.id, c.slug]),
  );

  // Resolve the products each section needs, in parallel.
  const productFetches = sections.map((s) => {
    if (s.type === 'category' && s.category_id) {
      return getProductsByCategory(s.category_id);
    }
    if (s.type === 'featured') {
      const ids = ((s.config.product_ids as string[] | undefined) ?? []).filter(
        Boolean,
      );
      return getProductsByIds(ids);
    }
    return Promise.resolve<ProductListItem[]>([]);
  });
  const productsBySection = await Promise.all(productFetches);

  return (
    <div>
      {sections.map((section, i) => {
        const products = productsBySection[i] ?? [];
        if (section.type === 'hero') return <Hero key={section.id} section={section} />;
        if (section.type === 'category')
          return (
            <CategorySection
              key={section.id}
              section={section}
              products={products}
              currency={currency}
              categorySlug={section.category_id ? categorySlug[section.category_id] : null}
            />
          );
        if (section.type === 'featured')
          return (
            <FeaturedSection
              key={section.id}
              section={section}
              products={products}
              currency={currency}
            />
          );
        return null;
      })}
    </div>
  );
}

function Hero({ section }: { section: HomepageSection }) {
  const cfg = section.config as {
    heading?: string;
    subtext?: string;
    cta_label?: string;
    cta_href?: string;
  };
  return (
    <section className="border-b border-line">
      <div className="container-page py-16 md:py-24">
        <p className="text-sm text-clay">New arrivals</p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-2 max-w-2xl">
          {cfg.heading ?? 'Seasonal clothing, made well.'}
        </h1>
        {cfg.subtext && (
          <p className="mt-4 max-w-xl text-ink">{cfg.subtext}</p>
        )}
        {cfg.cta_label && cfg.cta_href && (
          <div className="mt-8">
            <Link href={cfg.cta_href} className="btn btn-primary">
              {cfg.cta_label}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function SectionGrid({
  products,
  currency,
}: {
  products: ProductListItem[];
  currency: string;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
      {products.slice(0, 4).map((p) => (
        <ProductCard key={p.id} product={p} currency={currency} />
      ))}
    </div>
  );
}

function CategorySection({
  section,
  products,
  currency,
  categorySlug,
}: {
  section: HomepageSection;
  products: ProductListItem[];
  currency: string;
  categorySlug: string | null | undefined;
}) {
  return (
    <section className="container-page py-14 border-b border-line">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-2xl md:text-3xl">{section.title ?? 'Category'}</h2>
        {categorySlug && (
          <Link href={`/category/${categorySlug}`} className="text-sm text-clay">
            View all
          </Link>
        )}
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-muted">No items in this category yet.</p>
      ) : (
        <SectionGrid products={products} currency={currency} />
      )}
    </section>
  );
}

function FeaturedSection({
  section,
  products,
  currency,
}: {
  section: HomepageSection;
  products: ProductListItem[];
  currency: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className="container-page py-14">
      <h2 className="font-serif text-2xl md:text-3xl mb-6">
        {section.title ?? 'Featured'}
      </h2>
      <SectionGrid products={products} currency={currency} />
    </section>
  );
}
