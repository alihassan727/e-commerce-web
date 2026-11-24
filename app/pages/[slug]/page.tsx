import { notFound } from 'next/navigation';
import { getPublishedPage } from '@/lib/queries/catalog';

export default async function CmsPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedPage(params.slug);
  if (!page) notFound();

  return (
    <article className="container-page py-12 max-w-3xl">
      <h1 className="font-serif text-4xl mb-8 text-ink dark:text-dark-ink">{page.title}</h1>
      <div
        className="prose prose-sm max-w-none text-ink dark:text-dark-ink"
        dangerouslySetInnerHTML={{ __html: page.content ?? '' }}
      />
    </article>
  );
}
