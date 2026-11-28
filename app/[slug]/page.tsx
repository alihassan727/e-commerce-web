import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms-page-view';
import { getPublishedPage } from '@/lib/queries/catalog';

/**
 * Public CMS pages at the top-level URL (e.g. /about-us, /privacy-policy).
 *
 * Only published pages are returned by getPublishedPage, so a draft or
 * unpublished page is a 404 here. Static routes (shop, cart, account, ...) take
 * precedence over this dynamic segment, and unknown top-level paths 404.
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

export default async function PublicCmsPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedPage(params.slug);
  if (!page) notFound();

  return (
    <div className="container-page py-12 md:py-16">
      <CmsPageView page={page} />
    </div>
  );
}
