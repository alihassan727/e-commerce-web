'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminSetPagePublished } from '@/lib/actions/account';

export default function PagePublishToggle({
  slug,
  isPublished,
}: {
  slug: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
    const res = await adminSetPagePublished(slug, !isPublished);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-sm text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink disabled:opacity-50"
      >
        {busy ? 'Saving…' : isPublished ? 'Unpublish' : 'Publish'}
      </button>
      {err && <span className="text-[11px] theme-text">{err}</span>}
    </span>
  );
}
