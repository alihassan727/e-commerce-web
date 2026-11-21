'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Permanently deletes the currently signed-in user's account.
 *
 * Steps:
 * 1. Verify the caller has an active session (do not delete if not signed in).
 * 2. Delete the auth.users row via the service-role admin client.
 *    Supabase cascades this to the public.customers row via the
 *    ON DELETE SET NULL FK (the customer row is NOT deleted, so order
 *    history is preserved and unlinked rather than erased).
 * 3. Return { ok: true } on success; the client then signs out locally
 *    and redirects to home.
 *
 * This runs server-side only. The service-role key is never sent to the
 * browser. The user can only delete their own account (the session uid
 * is taken from the verified cookie, not from client input).
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'You are not signed in.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
