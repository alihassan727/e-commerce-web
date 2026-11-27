'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSetReviewStatus, adminDeleteReview } from '@/lib/actions/reviews';
import type { ReviewStatus } from '@/lib/types';

export default function AdminReviewActions({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: ReviewStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(status: ReviewStatus) {
    setBusy(true);
    setErr(null);
    const res = await adminSetReviewStatus(reviewId, status);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.refresh();
  }

  async function del() {
    if (!window.confirm('Delete this review permanently?')) return;
    setBusy(true);
    const res = await adminDeleteReview(reviewId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      {currentStatus !== 'approved' && (
        <button disabled={busy} className="theme-text" onClick={() => setStatus('approved')}>Approve</button>
      )}
      {currentStatus !== 'hidden' && (
        <button disabled={busy} className="text-muted dark:text-dark-muted" onClick={() => setStatus('hidden')}>Hide</button>
      )}
      {currentStatus !== 'pending' && (
        <button disabled={busy} className="text-muted dark:text-dark-muted" onClick={() => setStatus('pending')}>Set pending</button>
      )}
      <button disabled={busy} className="text-muted dark:text-dark-muted" onClick={del}>Delete</button>
      {err && <span className="theme-text">{err}</span>}
    </div>
  );
}
