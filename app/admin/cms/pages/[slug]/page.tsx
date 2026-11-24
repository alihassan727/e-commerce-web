import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminGetPage } from '@/lib/queries/catalog';
import PageEditorClient from './client';

export default async function AdminCmsPageEditorPage({ params }: { params: { slug: string } }) {
  const page = await adminGetPage(params.slug);
  if (!page) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">{page.title}</h1>
        <Link href="/admin/cms/pages" className="text-sm theme-text">Back to pages</Link>
      </div>
      <PageEditorClient
        slug={page.slug}
        initialTitle={page.title}
        initialContent={page.content ?? ''}
        initialPublished={page.is_published}
      />
    </div>
  );
}
