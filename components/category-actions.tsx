'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { deleteCategory, moveCategory } from '@/lib/actions/admin';

export default function CategoryActions({ id }: { id: string }) {
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
    <div className="flex items-center gap-3 text-sm">
      <button type="button" disabled={busy} className="theme-text" onClick={() => run(() => moveCategory(id, 'up'))}>
        Up
      </button>
      <button type="button" disabled={busy} className="theme-text" onClick={() => run(() => moveCategory(id, 'down'))}>
        Down
      </button>
      <Link href={`/admin/categories/${id}`} className="theme-text">
        Edit
      </Link>
      <button
        type="button"
        disabled={busy}
        className="text-muted"
        onClick={async () => {
          if (!window.confirm('Delete this category?')) return;
          await run(() => deleteCategory(id));
        }}
      >
        Delete
      </button>
      {err && <span className="theme-text">{err}</span>}
    </div>
  );
}
