'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { adminUpdatePage } from '@/lib/actions/account';
import { slugifyPage } from '@/lib/cms/defaults';

const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), { ssr: false });

export default function PageEditorClient({
  slug,
  initialTitle,
  initialContent,
  initialPublished,
}: {
  slug: string;
  initialTitle: string;
  initialContent: string;
  initialPublished: boolean;
}) {
  const router = useRouter();
  const [originalSlug, setOriginalSlug] = useState(slug);
  const [title, setTitle] = useState(initialTitle);
  const [pageSlug, setPageSlug] = useState(slug);
  const [content, setContent] = useState(initialContent ?? '');
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(publish: boolean) {
    setErr(null);
    setMsg(null);
    setSaving(true);
    const res = await adminUpdatePage({
      originalSlug,
      title,
      slug: pageSlug,
      content,
      isPublished: publish,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }

    setIsPublished(publish);
    setMsg(publish ? 'Page published.' : 'Draft saved.');

    if (res.slug !== originalSlug) {
      // Keep the editor on the saved record after a slug change.
      setOriginalSlug(res.slug);
      setPageSlug(res.slug);
      router.replace(`/admin/cms/pages/${res.slug}`);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="field">
        <label htmlFor="page-title">Page title</label>
        <input
          id="page-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="page-slug">URL slug</label>
        <div className="flex items-center gap-2">
          <input
            id="page-slug"
            className="input"
            value={pageSlug}
            onChange={(e) => setPageSlug(e.target.value)}
            onBlur={() => setPageSlug((s) => slugifyPage(s) || slugifyPage(title))}
            placeholder="about-us"
          />
          <button
            type="button"
            className="btn btn-ghost text-xs whitespace-nowrap"
            onClick={() => setPageSlug(slugifyPage(title))}
            disabled={!title.trim()}
            title="Build the slug from the page title"
          >
            From title
          </button>
        </div>
        <p className="text-xs text-muted dark:text-dark-muted">
          Public URL: /{slugifyPage(pageSlug) || slugifyPage(title) || slug}
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

      {showPreview && (
        <div className="border border-line dark:border-dark-line">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-line dark:border-dark-line">
            <p className="text-xs uppercase tracking-wider text-muted dark:text-dark-muted">
              Preview · unsaved editor content
            </p>
            <button
              type="button"
              className="text-xs theme-text"
              onClick={() => setShowPreview(false)}
            >
              Close preview
            </button>
          </div>
          <div className="p-4">
            <h2 className="font-serif text-2xl mb-4 text-ink dark:text-dark-ink">
              {title.trim() || 'Untitled page'}
            </h2>
            {content.trim() ? (
              <div className="cms-content" dangerouslySetInnerHTML={{ __html: content }} />
            ) : (
              <p className="text-sm text-muted dark:text-dark-muted">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </div>
      )}

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-outline" onClick={() => save(false)} disabled={saving}>
          {saving ? 'Saving' : 'Save draft'}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
          {saving ? 'Saving' : isPublished ? 'Save and republish' : 'Publish'}
        </button>
        {isPublished && (
          <button className="btn btn-ghost text-sm" onClick={() => save(false)} disabled={saving}>
            Unpublish
          </button>
        )}
        <button
          type="button"
          className="text-sm theme-text"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? 'Hide preview' : 'Preview'}
        </button>
      </div>
      <p className="text-xs text-muted dark:text-dark-muted">
        Status: {isPublished ? 'Published' : 'Draft'} &nbsp;|&nbsp; Public URL:{' '}
        /{originalSlug}
      </p>
    </div>
  );
}
