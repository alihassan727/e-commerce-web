import { notFound } from 'next/navigation';
import Link from 'next/link';
import CategoryForm from '@/components/category-form';
import { adminListCategories } from '@/lib/queries/admin';

export default async function EditCategoryPage({
  params,
}: {
  params: { id: string };
}) {
  const categories = await adminListCategories();
  const category = categories.find((c) => c.id === params.id) ?? null;
  if (!category) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Edit category</h1>
        <Link href="/admin/categories" className="text-sm theme-text">
          Back to categories
        </Link>
      </div>
      <div className="border border-line p-4 max-w-xl">
        <CategoryForm category={category} />
      </div>
    </div>
  );
}
