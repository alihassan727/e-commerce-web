import type { CmsPage } from '@/lib/types';

/**
 * Shared renderer for a CMS page, used by the public /[slug] route, the legacy
 * /pages/[slug] route and the admin draft preview so all three stay identical.
 * Content is admin-authored HTML from the existing cms_pages table.
 */
export default function CmsPageView({
  page,
}: {
  page: Pick<CmsPage, 'title' | 'content'>;
}) {
  const content = page.content?.trim();

  return (
    <article className="max-w-3xl">
      <h1 className="font-serif text-3xl md:text-4xl leading-tight mb-6 text-ink dark:text-dark-ink">
        {page.title}
      </h1>
      {content ? (
        <div className="cms-content" dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <p className="text-sm text-muted dark:text-dark-muted">
          This page has no content yet.
        </p>
      )}
    </article>
  );
}
