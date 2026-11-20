import { notFound } from 'next/navigation';
import ProductGallery from '@/components/product-gallery';
import ProductPurchase from '@/components/product-purchase';
import { getProductBySlug, getSiteSettings } from '@/lib/queries/catalog';

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

  return (
    <section className="container-page py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <ProductGallery images={product.images ?? []} alt={product.title} />
        <ProductPurchase product={product} currency={currency} />
      </div>
    </section>
  );
}
