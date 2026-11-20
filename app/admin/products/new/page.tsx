import ProductForm from '@/components/product-form';
import { adminListCategories } from '@/lib/queries/admin';

export default async function NewProductPage() {
  const categories = await adminListCategories();
  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">New product</h1>
      <ProductForm product={null} categories={categories} />
    </div>
  );
}
