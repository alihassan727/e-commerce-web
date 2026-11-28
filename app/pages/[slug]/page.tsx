import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms-page-view';
import { getPublishedPage } from '@/lib/queries/catalog';

/**
 * Legacy CMS page URL kept for links created before pages moved to the
 * top-level slug route. Drafts and unpublished pages are not returned by
 * getPublishedPage, so they 404 here as well.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const page = await getPublishedPage(params.slug);
  if (!page) return {};
  return { title: page.title };
}

export default async function CmsPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedPage(params.slug);
  if (!page) notFound();

  return (
    <div className="container-page py-12 md:py-16">
      <CmsPageView page={page} />
    </div>
  );
}
