'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  deleteHomepageSection,
  moveHomepageSection,
  toggleHomepageSection,
} from '@/lib/actions/admin';

export default function HomepageSectionActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) setErr(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" disabled={busy} className="theme-text" onClick={() => run(() => moveHomepageSection(id, 'up'))}>
        Up
      </button>
      <button type="button" disabled={busy} className="theme-text" onClick={() => run(() => moveHomepageSection(id, 'down'))}>
        Down
      </button>
      <Link href={`/admin/homepage/${id}`} className="theme-text">
        Edit
      </Link>
      <button
        type="button"
        disabled={busy}
        className="text-muted dark:text-dark-muted"
        onClick={() => run(() => toggleHomepageSection(id, !isActive))}
      >
        {isActive ? 'Hide' : 'Show'}
      </button>
      <button
        type="button"
        disabled={busy}
        className="text-muted dark:text-dark-muted"
        onClick={async () => {
          if (!window.confirm('Delete this section?')) return;
          await run(() => deleteHomepageSection(id));
        }}
      >
        Delete
      </button>
      {err && <span className="theme-text">{err}</span>}
    </div>
  );
}
