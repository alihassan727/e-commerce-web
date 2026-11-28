import Link from 'next/link';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms-page-view';
import { adminGetPage } from '@/lib/queries/catalog';

/**
 * Draft preview for admins. Reads the saved page with the service-role client
 * (admin layout + middleware already restrict /admin), so unpublished content
 * can be reviewed without ever being exposed on the public route.
 */
export default async function AdminCmsPagePreview({
  params,
}: {
  params: { slug: string };
}) {
  const page = await adminGetPage(params.slug);
  if (!page) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-xs uppercase tracking-wider text-muted dark:text-dark-muted">
          {page.is_published ? 'Published page' : 'Draft preview'} · /{page.slug}
        </p>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/admin/cms/pages/${page.slug}`} className="theme-text">
            Back to editor
          </Link>
          <Link href="/admin/cms/pages" className="text-muted dark:text-dark-muted">
            All pages
          </Link>
        </div>
      </div>

      <div className="border border-line dark:border-dark-line p-6 md:p-10 bg-canvas dark:bg-dark-canvas">
        <CmsPageView page={page} />
      </div>

      {!page.is_published && (
        <p className="mt-4 text-xs text-muted dark:text-dark-muted">
          This page is a draft, so visitors get a 404 at /{page.slug}. Publish it
          from the page list or the editor to make it public.
        </p>
      )}
    </div>
  );
}
