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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Homepage</h1>
        <div className="flex items-center gap-3">
          <Link href="/" target="_blank" className="btn btn-outline">
            Preview storefront
          </Link>
          <Link href="/admin/homepage/new" className="btn btn-primary">
            Add section
          </Link>
        </div>
      </div>

      <p className="text-sm text-muted dark:text-dark-muted mb-6">
        Sections render on the home page in this order. Hidden sections stay in
        the list but do not appear to customers. Add a <strong>Category boxes grid</strong> section
        to control which category cards appear on the homepage.
      </p>

      {sections.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No sections yet.</p>
      ) : (
        <div className="border border-line dark:border-dark-line rounded-md overflow-hidden">
          {sections.map((s) => {
            const isCategoryBoxes = s.type === 'category' && s.config?.kind === 'category_boxes';
            return (
              <div
                key={s.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
              >
                <div>
                  <p className="font-medium text-ink dark:text-dark-ink">
                    {s.type === 'hero'
                      ? 'Hero banner'
                      : isCategoryBoxes
                        ? 'Category boxes grid'
                        : s.type === 'category'
                          ? `Category showcase: ${catName(s.category_id) ?? 'Unknown'}`
                          : 'Featured products'}
                  </p>
                  <p className="text-muted dark:text-dark-muted">
                    {s.title ?? 'no title'} · {s.is_active ? 'visible' : 'hidden'} · order {s.sort_order}
                  </p>
                </div>
                <HomepageSectionActions id={s.id} isActive={s.is_active} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
