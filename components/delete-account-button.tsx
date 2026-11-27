'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount, signOut } from '@/lib/actions/account';

/**
 * Permanently deletes the user's Supabase account after a two-step
 * confirmation. The server action removes the auth.users row (and therefore
 * the session) using the service-role key. After success the client clears
 * the local session and redirects to home.
 */
export default function DeleteAccountButton() {
  const router = useRouter();

  // Two-step confirm: first click shows the warning, second click executes.
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setLoading(true);
    setError(null);

    const result = await deleteAccount();

    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }

    // Server deleted the auth row. Best-effort clear the now-invalid session
    // cookies, then redirect.
    await signOut();
    router.push('/');
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-ghost text-sm text-muted"
        onClick={() => setConfirming(true)}
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="border border-line p-4 max-w-sm">
      <p className="text-sm font-medium">Delete your account?</p>
      <p className="text-sm text-muted mt-1">
        This is permanent. Your account and login will be removed from
        Supabase. Your order history will be kept but unlinked from any
        account.
      </p>
      {error && <p className="text-sm theme-text mt-2">{error}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          className="btn btn-outline text-sm"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Deleting' : 'Yes, delete my account'}
        </button>
        <button
          type="button"
          className="text-sm text-muted"
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
