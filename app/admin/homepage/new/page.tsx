import Link from 'next/link';
import HomepageSectionForm from '@/components/homepage-section-form';
import { adminListCategories, adminListProducts } from '@/lib/queries/admin';

export default async function NewHomepageSectionPage() {
  const [categories, products] = await Promise.all([
    adminListCategories(),
    adminListProducts(),
  ]);
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Add homepage section</h1>
        <Link href="/admin/homepage" className="text-sm theme-text">
          Back to homepage
        </Link>
      </div>
      <HomepageSectionForm
        section={null}
        categories={categories}
        products={products.map((p) => ({ id: p.id, title: p.title, is_active: p.is_active }))}
      />
    </div>
  );
}
