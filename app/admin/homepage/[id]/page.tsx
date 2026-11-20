import { notFound } from 'next/navigation';
import Link from 'next/link';
import HomepageSectionForm from '@/components/homepage-section-form';
import { adminListCategories, adminListHomepageSections, adminListProducts } from '@/lib/queries/admin';

export default async function EditHomepageSectionPage({
  params,
}: {
  params: { id: string };
}) {
  const [sections, categories, products] = await Promise.all([
    adminListHomepageSections(),
    adminListCategories(),
    adminListProducts(),
  ]);
  const section = sections.find((s) => s.id === params.id) ?? null;
  if (!section) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Edit homepage section</h1>
        <Link href="/admin/homepage" className="text-sm text-clay">
          Back to homepage
        </Link>
      </div>
      <HomepageSectionForm
        section={section}
        categories={categories}
        products={products.map((p) => ({ id: p.id, title: p.title, is_active: p.is_active }))}
      />
    </div>
  );
}
