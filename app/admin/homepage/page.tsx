import Link from 'next/link';
import HomepageSectionActions from '@/components/homepage-section-actions';
import { adminListHomepageSections, adminListCategories } from '@/lib/queries/admin';

export default async function AdminHomepagePage() {
  const [sections, categories] = await Promise.all([
    adminListHomepageSections(),
    adminListCategories(),
  ]);
  const catName = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? null : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Homepage</h1>
        <Link href="/admin/homepage/new" className="btn btn-primary">
          Add section
        </Link>
      </div>

      <p className="text-sm text-muted mb-6">
        Sections render on the home page in this order. Hidden sections stay in
        the list but do not appear to customers.
      </p>

      {sections.length === 0 ? (
        <p className="text-sm text-muted">No sections yet.</p>
      ) : (
        <div className="border border-line">
          {sections.map((s) => (
            <div
              key={s.id}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-line last:border-0 text-sm"
            >
              <div>
                <p className="font-medium">
                  {s.type === 'hero'
                    ? 'Hero'
                    : s.type === 'category'
                      ? `Category: ${catName(s.category_id) ?? 'Unknown'}`
                      : 'Featured products'}
                </p>
                <p className="text-muted">
                  {s.title ?? 'no title'} · {s.is_active ? 'visible' : 'hidden'} · order {s.sort_order}
                </p>
              </div>
              <HomepageSectionActions id={s.id} isActive={s.is_active} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
