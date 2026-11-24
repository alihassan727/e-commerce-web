import Link from 'next/link';
import { adminGetAllPages } from '@/lib/queries/catalog';

export default async function AdminCmsPagesListPage() {
  const pages = await adminGetAllPages();
  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Website pages</h1>
      <p className="text-sm text-muted dark:text-dark-muted mb-6">
        Edit your static website pages. Only published pages are visible to customers.
      </p>
      <div className="border border-line dark:border-dark-line">
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`/admin/cms/pages/${p.slug}`}
            className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm"
          >
            <span className="font-medium text-ink dark:text-dark-ink">{p.title}</span>
            <span className={`border px-2 py-0.5 text-xs ${p.is_published ? 'theme-border theme-text' : 'border-line dark:border-dark-line text-muted dark:text-dark-muted'}`}>
              {p.is_published ? 'Published' : 'Draft'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
