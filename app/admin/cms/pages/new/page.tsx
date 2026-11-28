import Link from 'next/link';
import NewPageClient from './client';

export default function NewCmsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">New page</h1>
        <Link href="/admin/cms/pages" className="text-sm theme-text">
          Back to pages
        </Link>
      </div>
      <NewPageClient />
    </div>
  );
}
