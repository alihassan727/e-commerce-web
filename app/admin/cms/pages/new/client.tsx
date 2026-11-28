'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { adminCreatePage } from '@/lib/actions/account';
import { slugifyPage } from '@/lib/cms/defaults';

const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), { ssr: false });

export default function NewPageClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effectiveSlug = slugifyPage(pageSlug || title);

  async function save(publish: boolean) {
    setErr(null);
    setSaving(true);
    const res = await adminCreatePage({
      title,
      slug: effectiveSlug,
      content,
      isPublished: publish,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.push(`/admin/cms/pages/${res.slug}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="field">
        <label htmlFor="new-page-title">Page title</label>
        <input
          id="new-page-title"
          className="input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setPageSlug(slugifyPage(e.target.value));
          }}
          placeholder="e.g. Size Guide"
        />
      </div>

      <div className="field">
        <label htmlFor="new-page-slug">URL slug</label>
        <input
          id="new-page-slug"
          className="input"
          value={pageSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setPageSlug(e.target.value);
          }}
          onBlur={() => setPageSlug((s) => slugifyPage(s) || slugifyPage(title))}
          placeholder="size-guide"
        />
        <p className="text-xs text-muted dark:text-dark-muted">
          Public URL: /{effectiveSlug || 'your-page'}
        </p>
      </div>

      <div className="field">
        <label>Content</label>
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Start writing… use the toolbar for headings, lists and links."
        />
      </div>

      {err && <p className="text-sm theme-text">{err}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-outline" onClick={() => save(false)} disabled={saving}>
          {saving ? 'Saving' : 'Save draft'}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
          {saving ? 'Saving' : 'Publish'}
        </button>
      </div>
      <p className="text-xs text-muted dark:text-dark-muted">
        New pages start as drafts unless you publish them, and only published
        pages are visible on the website.
      </p>
    </div>
  );
}
