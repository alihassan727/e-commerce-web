import { notFound } from 'next/navigation';
import Link from 'next/link';
import ProductForm from '@/components/product-form';
import ProductDeleteButton from '@/components/product-delete-button';
import { adminGetProduct, adminListCategories } from '@/lib/queries/admin';

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const [product, categories] = await Promise.all([
    adminGetProduct(params.id),
    adminListCategories(),
  ]);

  if (!product) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">{product.title}</h1>
        <Link href="/admin/products" className="text-sm theme-text">
          Back to products
        </Link>
      </div>

      <ProductForm product={product} categories={categories} />

      <div className="mt-12 pt-6 border-t border-line dark:border-dark-line">
        <ProductDeleteButton id={product.id} />
      </div>
    </div>
  );
}
