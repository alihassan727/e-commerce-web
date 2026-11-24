import Link from 'next/link';
import ProductCard from '@/components/product-card';
import {
  getActiveCategories,
  getActiveFeatures,
  getHomepageSections,
  getProductsByCategory,
  getProductsByIds,
  getSiteSettings,
} from '@/lib/queries/catalog';
import { getImageUrl, getHeroImageUrl } from '@/lib/storage';
import type { CmsFeature, HomepageSection, ProductListItem } from '@/lib/types';

export default async function Home() {
  const [settings, sections, categories, features] = await Promise.all([
    getSiteSettings(),
    getHomepageSections(),
    getActiveCategories(),
    getActiveFeatures(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const categorySlug: Record<string, string> = Object.fromEntries(
    categories.map((c) => [c.id, c.slug]),
  );

  // Resolve products for each section in parallel.
  const productFetches = sections.map((s) => {
    if (s.type === 'category' && s.category_id) {
      return getProductsByCategory(s.category_id);
    }
    if (s.type === 'featured') {
      const ids = ((s.config.product_ids as string[] | undefined) ?? []).filter(Boolean);
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

      {/* Features section — renders only when there are active features */}
      {features.length > 0 && <FeaturesSection features={features} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero({ section }: { section: HomepageSection }) {
  const cfg = section.config as {
    heading?: string;
    subtext?: string;
    cta_label?: string;
    cta_href?: string;
    desktop_image_path?: string;
    mobile_image_path?: string;
    image_path?: string; // legacy single-image key
  };

  // Prefer the new desktop_image_path; fall back to legacy image_path.
  const desktopUrl =
    getHeroImageUrl(cfg.desktop_image_path ?? null) ?? getHeroImageUrl(cfg.image_path ?? null);
  const mobileUrl = getHeroImageUrl(cfg.mobile_image_path ?? null);

  return (
    <section className="border-b border-line dark:border-dark-line relative overflow-hidden">
      {/* Background image (desktop) */}
      {desktopUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={desktopUrl}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover ${mobileUrl ? 'hidden md:block' : ''}`}
          />
          {mobileUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mobileUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover md:hidden"
            />
          )}
          <div className="absolute inset-0 bg-canvas/60 dark:bg-dark-canvas/60" />
        </>
      )}
      <div className="container-page py-16 md:py-24 relative z-10">
        <p className="text-sm theme-text">New arrivals</p>
        <h1 className="font-serif text-4xl md:text-6xl tracking-tight mt-2 max-w-2xl text-ink dark:text-dark-ink">
          {cfg.heading ?? 'Seasonal clothing, made well.'}
        </h1>
        {cfg.subtext && (
          <p className="mt-4 max-w-xl text-ink dark:text-dark-ink">{cfg.subtext}</p>
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

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
function FeaturesSection({ features }: { features: CmsFeature[] }) {
  return (
    <section className="border-b border-line dark:border-dark-line">
      <div className="container-page py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.id} className="flex items-start gap-4">
              {f.icon && <span className="text-2xl shrink-0">{f.icon}</span>}
              <div>
                <p className="font-medium text-ink dark:text-dark-ink">{f.heading}</p>
                {f.description && (
                  <p className="text-sm text-muted dark:text-dark-muted mt-0.5">{f.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Product grids
// ---------------------------------------------------------------------------
function SectionGrid({ products, currency }: { products: ProductListItem[]; currency: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
      {products.slice(0, 4).map((p) => (
        <ProductCard key={p.id} product={p} currency={currency} />
      ))}
    </div>
  );
}

function CategorySection({
  section, products, currency, categorySlug,
}: {
  section: HomepageSection;
  products: ProductListItem[];
  currency: string;
  categorySlug: string | null | undefined;
}) {
  return (
    <section className="container-page py-14 border-b border-line dark:border-dark-line">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-serif text-2xl md:text-3xl text-ink dark:text-dark-ink">
          {section.title ?? 'Category'}
        </h2>
        {categorySlug && (
          <Link href={`/category/${categorySlug}`} className="text-sm theme-text">View all</Link>
        )}
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No items in this category yet.</p>
      ) : (
        <SectionGrid products={products} currency={currency} />
      )}
    </section>
  );
}

function FeaturedSection({
  section, products, currency,
}: {
  section: HomepageSection;
  products: ProductListItem[];
  currency: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className="container-page py-14 dark:border-dark-line">
      <h2 className="font-serif text-2xl md:text-3xl mb-6 text-ink dark:text-dark-ink">
        {section.title ?? 'Featured'}
      </h2>
      <SectionGrid products={products} currency={currency} />
    </section>
  );
}
