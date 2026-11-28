'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteProduct } from '@/lib/actions/admin';

/**
 * Compact delete control for the admin product list. Uses the existing
 * deleteProduct action (admin-only, removes the product and its image files)
 * and refreshes the list in place after a confirmed deletion.
 */
export default function AdminProductDelete({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (
      !window.confirm(
        `Delete “${title}”? This cannot be undone. Saved items in past orders keep their name, price and image.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await deleteProduct(id);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="text-sm text-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-ink disabled:opacity-50"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {err && <span className="text-xs theme-text">{err}</span>}
    </span>
  );
}
