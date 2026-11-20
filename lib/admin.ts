import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the currently logged-in user (or null) for a server request.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns true when the current user's email matches the ADMIN_EMAIL
 * allowlist. This is the single source of truth for admin identity.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(user && adminEmail && user.email === adminEmail);
}

/**
 * Returns true only when the caller is the admin; throws otherwise so a
 * Server Action that forgets to check cannot silently succeed. Call this at
 * the top of every admin mutation.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error('Unauthorized: admin access required.');
  }
}
