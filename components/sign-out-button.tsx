'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/actions/account';

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    setLoading(true);
    await signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button onClick={onSignOut} disabled={loading} className="btn btn-ghost text-sm">
      {loading ? 'Signing out' : 'Sign out'}
    </button>
  );
}
