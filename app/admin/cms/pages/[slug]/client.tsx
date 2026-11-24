'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { adminSavePage } from '@/lib/actions/account';

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
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent ?? '');
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(publish: boolean) {
    setErr(null); setMsg(null);
    setSaving(true);
    const res = await adminSavePage(slug, title, content, publish);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setIsPublished(publish);
    setMsg(publish ? 'Page published.' : 'Draft saved.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="field">
        <label htmlFor="page-title">Page title</label>
        <input id="page-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Content</label>
        <RichTextEditor value={content} onChange={setContent} placeholder="Start writing..." />
      </div>

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}

      <div className="flex items-center gap-3">
        <button className="btn btn-outline" onClick={() => save(false)} disabled={saving}>
          {saving ? 'Saving' : 'Save as draft'}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
          {isPublished ? 'Save and republish' : 'Publish'}
        </button>
        {isPublished && (
          <button className="btn btn-ghost text-sm" onClick={() => save(false)} disabled={saving}>
            Unpublish
          </button>
        )}
      </div>
      <p className="text-xs text-muted dark:text-dark-muted">
        Status: {isPublished ? 'Published' : 'Draft'} &nbsp;|&nbsp; Page URL: /pages/{slug}
      </p>
    </div>
  );
}
