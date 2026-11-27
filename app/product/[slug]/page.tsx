import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetailView from '@/components/product-detail';
import ProductReviews from '@/components/product-reviews';
import { getProductBySlug, getSiteSettings } from '@/lib/queries/catalog';
import { getStorageUrl } from '@/lib/storage';
import {
  getProductReviews,
  getReviewEligibility,
  summarizeReviews,
} from '@/lib/queries/reviews';
import { getMyCustomer } from '@/lib/queries/account';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [settings, product] = await Promise.all([
    getSiteSettings(),
    getProductBySlug(params.slug),
  ]);
  if (!product) return { title: 'Product not found' };

  const storeName = settings?.store_name ?? 'Atlas Clothier';
  const description =
    product.description?.trim() ||
    `Shop ${product.title} at ${storeName} — cash on delivery.`;

  const firstColorImage = [...(product.colors ?? [])]
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((c) =>
      [...(c.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    )[0];
  const firstProductImage = [...(product.images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  )[0];
  const imagePath = firstColorImage?.storage_path ?? firstProductImage?.storage_path;
  const imageUrl = imagePath
    ? getStorageUrl('product-images', imagePath)
    : null;

  return {
    title: `${product.title} · ${storeName}`,
    description: description.slice(0, 300),
    openGraph: {
      title: product.title,
      description: description.slice(0, 300),
      type: 'website',
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const [settings, product] = await Promise.all([
    getSiteSettings(),
    getProductBySlug(params.slug),
  ]);

  if (!product) notFound();
  const currency = settings?.currency ?? 'PKR';

  // Fetch reviews and the signed-in customer in parallel, then derive the
  // rating summary locally (one query instead of two over the same rows).
  const [reviews, customer] = await Promise.all([
    getProductReviews(product.id),
    getMyCustomer(),
  ]);
  const summary = summarizeReviews(reviews);

  let canReview = false;
  let existingReview = null;
  if (customer) {
    const eligibility = await getReviewEligibility(customer.id, product.id, customer.email);
    canReview = eligibility.eligible && !eligibility.alreadyReviewed;
    existingReview = eligibility.review;
  }

  return (
    <section className="container-page py-12">
      <ProductDetailView product={product} currency={currency} />

      <ProductReviews
        productId={product.id}
        reviews={reviews}
        summary={summary}
        canReview={canReview}
        existingReview={existingReview}
      />
    </section>
  );
}
