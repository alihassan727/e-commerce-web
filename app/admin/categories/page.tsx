import CategoryForm from '@/components/category-form';
import CategoryActions from '@/components/category-actions';
import { adminListCategories } from '@/lib/queries/admin';

export default async function AdminCategoriesPage() {
  const categories = await adminListCategories();

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Categories</h1>

      <div className="border border-line p-4 mb-8">
        <h2 className="font-medium mb-3">Add a category</h2>
        <CategoryForm category={null} />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <div className="border border-line">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-line last:border-0 text-sm"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted">
                  {c.slug} · order {c.sort_order} · {c.is_active ? 'active' : 'hidden'}
                </p>
              </div>
              <CategoryActions id={c.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
