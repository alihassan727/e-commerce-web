import Link from 'next/link';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import ProductImage from '@/components/product-image';
import {
  getActiveCategories,
  getActiveFeatures,
  getCategoryCoverImages,
  getHomepageSections,
  getProductsByCategory,
  getProductsByIds,
  getSiteSettings,
} from '@/lib/queries/catalog';
import { getHeroImageUrl } from '@/lib/storage';
import type {
  Category,
  CategoryBoxItem,
  CmsFeature,
  HomepageSection,
  ProductListItem,
} from '@/lib/types';

export default async function Home() {
  const [settings, sections, categories, features] = await Promise.all([
    getSiteSettings(),
    getHomepageSections(),
    getActiveCategories(),
    getActiveFeatures(),
  ]);
  const currency = settings?.currency ?? 'PKR';
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const hasExplicitCategoryBoxes = sections.some(
    (s) => s.type === 'category' && s.config?.kind === 'category_boxes',
  );

  // Resolve products for product-based sections and cover images for category boxes in parallel.
  const productFetches = sections.map((s) => {
    if (s.type === 'category' && s.config?.kind === 'category_boxes') {
      return Promise.resolve<ProductListItem[]>([]);
    }
    if (s.type === 'category' && s.category_id) {
      return getProductsByCategory(s.category_id);
    }
    if (s.type === 'featured') {
      const ids = ((s.config.product_ids as string[] | undefined) ?? []).filter(Boolean);
      return getProductsByIds(ids);
    }
    return Promise.resolve<ProductListItem[]>([]);
  });

  const [productsBySection, categoryCoverImages] = await Promise.all([
    Promise.all(productFetches),
    getCategoryCoverImages(categories.map((c) => c.id)),
  ]);

  return (
    <div>
      {sections.map((section, i) => {
        const products = productsBySection[i] ?? [];
        if (section.type === 'hero') return <Hero key={section.id} section={section} />;
        if (section.type === 'category' && section.config?.kind === 'category_boxes') {
          return (
            <CategoryBoxesSection
              key={section.id}
              title={section.title ?? 'Shop by Category'}
              description={(section.config.description as string | undefined) ?? undefined}
              items={
                Array.isArray(section.config.items)
                  ? (section.config.items as CategoryBoxItem[])
                  : undefined
              }
              categories={categories}
              coverImages={categoryCoverImages}
            />
          );
        }
        if (section.type === 'category') {
          const cat = section.category_id ? categoryById.get(section.category_id) : undefined;
          return (
            <CategorySection
              key={section.id}
              section={section}
              products={products}
              currency={currency}
              categorySlug={cat?.slug ?? null}
            />
          );
        }
        if (section.type === 'featured') {
          return (
            <FeaturedSection
              key={section.id}
              section={section}
              products={products}
              currency={currency}
            />
          );
        }
        return null;
      })}

      {/* Default Category Boxes near bottom if admin hasn't added a custom Category Boxes section */}
      {!hasExplicitCategoryBoxes && categories.length > 0 && (
        <CategoryBoxesSection
          title="Shop by Category"
          description="Explore our curated collections across every essential."
          categories={categories}
          coverImages={categoryCoverImages}
        />
      )}

      {/* Store Promises / Features */}
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
    image_path?: string;
  };

  const desktopUrl =
    getHeroImageUrl(cfg.desktop_image_path ?? null) ?? getHeroImageUrl(cfg.image_path ?? null);
  const mobileUrl = getHeroImageUrl(cfg.mobile_image_path ?? null);

  return (
    <section className="relative overflow-hidden border-b border-line dark:border-dark-line bg-surface dark:bg-dark-surface">
      {desktopUrl && (
        <>
          <Image
            src={desktopUrl}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className={`object-cover ${mobileUrl ? 'hidden md:block' : ''}`}
          />
          {mobileUrl && (
            <Image
              src={mobileUrl}
              alt=""
              aria-hidden="true"
              fill
              sizes="100vw"
              className="object-cover md:hidden"
            />
          )}
          <div className="absolute inset-0 bg-canvas/70 dark:bg-dark-canvas/70" />
        </>
      )}

      <div className="container-page py-20 md:py-32 relative z-10">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] theme-text">
            Atlas Clothier
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl tracking-tight leading-[1.08] mt-3 text-ink dark:text-dark-ink">
            {cfg.heading || 'Seasonal clothing, made well.'}
          </h1>
          {cfg.subtext && (
            <p className="mt-5 text-base md:text-lg text-ink/85 dark:text-dark-ink/85 max-w-xl leading-relaxed">
              {cfg.subtext}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {cfg.cta_label && cfg.cta_href ? (
              <Link href={cfg.cta_href} className="btn btn-primary px-6 py-3">
                {cfg.cta_label}
              </Link>
            ) : (
              <Link href="/shop" className="btn btn-primary px-6 py-3">
                Shop collection
              </Link>
            )}
          </div>
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
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
  categorySlug: string | null;
}) {
  const description = (section.config?.description as string | undefined) ?? null;

  return (
    <section className="container-page py-16 md:py-20 border-b border-line dark:border-dark-line">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink dark:text-dark-ink">
            {section.title ?? 'Category'}
          </h2>
          {description && (
            <p className="text-sm text-muted dark:text-dark-muted mt-1.5 max-w-xl">
              {description}
            </p>
          )}
        </div>
        {categorySlug && (
          <Link
            href={`/category/${categorySlug}`}
            className="text-sm font-medium theme-text hover:underline underline-offset-4 whitespace-nowrap"
          >
            View all
          </Link>
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
  section,
  products,
  currency,
}: {
  section: HomepageSection;
  products: ProductListItem[];
  currency: string;
}) {
  if (products.length === 0) return null;
  const description = (section.config?.description as string | undefined) ?? null;
  const ctaLabel = (section.config?.cta_label as string | undefined) ?? null;
  const ctaHref = (section.config?.cta_href as string | undefined) ?? null;

  return (
    <section className="container-page py-16 md:py-20 border-b border-line dark:border-dark-line">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink dark:text-dark-ink">
            {section.title ?? 'Featured'}
          </h2>
          {description && (
            <p className="text-sm text-muted dark:text-dark-muted mt-1.5 max-w-xl">
              {description}
            </p>
          )}
        </div>
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="text-sm font-medium theme-text hover:underline underline-offset-4 whitespace-nowrap"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
      <SectionGrid products={products} currency={currency} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Category Boxes Grid
// ---------------------------------------------------------------------------
function CategoryBoxesSection({
  title,
  description,
  items,
  categories,
  coverImages,
}: {
  title: string;
  description?: string;
  items?: CategoryBoxItem[];
  categories: Category[];
  coverImages: Record<string, string>;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const resolvedBoxes = items
    ? [...items]
        .filter((it) => it.is_active && catMap.has(it.category_id))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((it) => {
          const cat = catMap.get(it.category_id)!;
          return {
            id: cat.id,
            slug: cat.slug,
            title: it.title?.trim() || cat.name,
            customImageUrl: it.image_path ? getHeroImageUrl(it.image_path) : null,
            productImagePath: coverImages[cat.id] ?? null,
          };
        })
    : categories.map((cat) => ({
        id: cat.id,
        slug: cat.slug,
        title: cat.name,
        customImageUrl: null,
        productImagePath: coverImages[cat.id] ?? null,
      }));

  if (resolvedBoxes.length === 0) return null;

  return (
    <section className="container-page py-16 md:py-20 border-b border-line dark:border-dark-line">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-ink dark:text-dark-ink">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted dark:text-dark-muted mt-1.5 max-w-xl">
              {description}
            </p>
          )}
        </div>
        <Link
          href="/shop"
          className="text-sm font-medium theme-text hover:underline underline-offset-4 whitespace-nowrap"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {resolvedBoxes.map((box) => (
          <Link
            key={box.id}
            href={`/category/${box.slug}`}
            className="group block rounded-lg overflow-hidden border border-line dark:border-dark-line bg-surface dark:bg-dark-surface transition-colors hover:border-muted dark:hover:border-dark-muted"
          >
            <div className="aspect-[4/5] w-full overflow-hidden bg-canvas dark:bg-dark-canvas">
              {box.customImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={box.customImageUrl}
                  alt={box.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ProductImage
                  path={box.productImagePath}
                  alt={box.title}
                  className="w-full h-full object-cover"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              )}
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between gap-2">
              <h3 className="font-serif text-base md:text-lg text-ink dark:text-dark-ink group-hover:underline underline-offset-4">
                {box.title}
              </h3>
              <span className="text-xs text-muted dark:text-dark-muted">Explore</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Store Features (no emoji clutter)
// ---------------------------------------------------------------------------
function FeaturesSection({ features }: { features: CmsFeature[] }) {
  return (
    <section className="bg-surface/60 dark:bg-dark-surface/60">
      <div className="container-page py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f, idx) => (
            <div key={f.id} className="flex flex-col gap-1.5 border-t border-line dark:border-dark-line pt-4 md:border-t-0 md:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wider theme-text">
                0{idx + 1}
              </p>
              <p className="font-medium text-ink dark:text-dark-ink">{f.heading}</p>
              {f.description && (
                <p className="text-sm text-muted dark:text-dark-muted leading-relaxed">
                  {f.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
