import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Customer } from '@/lib/types';

type AuthUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

function displayName(user: AuthUser): string | null {
  const metadata = user.user_metadata ?? {};
  const raw = metadata.full_name ?? metadata.name;
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name || null;
}

/** Escapes LIKE wildcards so an email such as first_last@example.com matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function findByAuthUid(authUid: string): Promise<Customer | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('customers')
    .select('*')
    .eq('auth_uid', authUid)
    .maybeSingle();
  if (error) {
    console.error('[customer] lookup failed:', error.message);
    throw new Error('Could not load your customer profile.');
  }
  return (data as Customer | null) ?? null;
}

/**
 * Returns the public.customers row for an Auth user, recreating or re-linking it
 * when it is missing.
 *
 * Database cleanup can delete customer rows while Supabase Auth users remain.
 * Every account screen depends on this row, so it is restored on demand instead
 * of leaving the account unusable.
 *
 * Duplicate safety:
 *  - auth_uid is UNIQUE and lookup happens first.
 *  - An unlinked row with the same email (for example from guest checkout) is
 *    linked instead of creating a second customer.
 *  - Concurrent first requests fall back to a re-read after a conflicting write.
 */
export async function ensureCustomerForUser(user: AuthUser): Promise<Customer> {
  const existing = await findByAuthUid(user.id);
  if (existing) return existing;

  const admin = createAdminClient();
  const email = (user.email ?? '').trim().toLowerCase();

  // A guest customer row may already exist for this email. Link it so that
  // historical orders and addresses stay attached to the account.
  if (email) {
    const { data: guest, error: guestError } = await admin
      .from('customers')
      .select('*')
      .is('auth_uid', null)
      .ilike('email', escapeLike(email))
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (guestError) {
      console.error('[customer] guest lookup failed:', guestError.message);
      throw new Error('Could not load your customer profile.');
    }

    if (guest) {
      const { data: linked, error: linkError } = await admin
        .from('customers')
        .update({ auth_uid: user.id })
        .eq('id', guest.id)
        .is('auth_uid', null)
        .select('*')
        .maybeSingle();

      if (!linkError && linked) return linked as Customer;

      // A parallel request may have linked or created the row already.
      const raced = await findByAuthUid(user.id);
      if (raced) return raced;

      if (linkError) {
        console.error('[customer] link failed:', linkError.message);
        throw new Error('Could not link your customer profile.');
      }
    }
  }

  const { data: created, error: insertError } = await admin
    .from('customers')
    .insert({ auth_uid: user.id, email, name: displayName(user) })
    .select('*')
    .single();

  if (insertError || !created) {
    const raced = await findByAuthUid(user.id);
    if (raced) return raced;
    console.error('[customer] create failed:', insertError?.message);
    throw new Error('Could not create your customer profile.');
  }

  return created as Customer;
}

/** Returns the signed-in user's customer row, or null when signed out. */
export async function getCurrentCustomer(): Promise<Customer | null> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return ensureCustomerForUser(user);
}
