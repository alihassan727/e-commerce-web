'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteProduct } from '@/lib/actions/admin';

export default function ProductDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setBusy(true);
    setErr(null);
    const res = await deleteProduct(id);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.push('/admin/products');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" className="btn btn-outline" onClick={onDelete} disabled={busy}>
        {busy ? 'Deleting' : 'Delete product'}
      </button>
      {err && <span className="text-sm theme-text">{err}</span>}
    </div>
  );
}
