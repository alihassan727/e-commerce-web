import Link from 'next/link';
import { adminGetAllPages } from '@/lib/queries/catalog';
import { ensureDefaultCmsPages } from '@/lib/cms/init';
import { DEFAULT_CMS_PAGES } from '@/lib/cms/defaults';
import PagePublishToggle from './publish-toggle';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function AdminCmsPagesListPage() {
  // Idempotent: creates only the standard pages that are missing, as drafts.
  await ensureDefaultCmsPages();
  const pages = await adminGetAllPages();

  // Standard pages first in their canonical order, then any custom pages.
  const canonicalOrder = new Map(DEFAULT_CMS_PAGES.map((d, i) => [d.slug, i]));
  const ordered = [...pages].sort((a, b) => {
    const ai = canonicalOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bi = canonicalOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.title.localeCompare(b.title);
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Website Pages</h1>
        <Link href="/admin/cms/pages/new" className="btn btn-primary">
          New page
        </Link>
      </div>
      <p className="text-sm text-muted dark:text-dark-muted mb-6 max-w-2xl">
        Manage your information pages — About, policies and terms. Drafts are
        visible only here; published pages appear on the website and in the
        footer.
      </p>

      {ordered.length === 0 ? (
        <div className="border border-line dark:border-dark-line p-8 text-center">
          <p className="text-sm text-muted dark:text-dark-muted">No pages yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((page) => (
            <div
              key={page.id}
              className="border border-line dark:border-dark-line p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm text-ink dark:text-dark-ink break-words">
                    {page.title}
                  </p>
                  <span
                    className={`border px-1.5 py-0.5 text-[11px] ${
                      page.is_published
                        ? 'theme-border theme-text'
                        : 'border-line dark:border-dark-line text-muted dark:text-dark-muted'
                    }`}
                  >
                    {page.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-muted dark:text-dark-muted mt-1 truncate">
                  /{page.slug}
                </p>
                <p className="text-xs text-muted dark:text-dark-muted">
                  Updated {formatDate(page.updated_at)}
                </p>
              </div>

              <div className="flex items-center gap-4 text-sm shrink-0">
                <Link href={`/admin/cms/pages/${page.slug}`} className="theme-text">
                  Edit
                </Link>
                <Link
                  href={`/admin/cms/pages/${page.slug}/preview`}
                  className="text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink"
                >
                  Preview
                </Link>
                <PagePublishToggle slug={page.slug} isPublished={page.is_published} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
