'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin';
import type { TicketCategory } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getCustomerId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('customers')
    .select('id')
    .eq('auth_uid', userId)
    .maybeSingle();
  return data?.id ?? null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Profile update
// ---------------------------------------------------------------------------

export interface ProfileInput {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const customerId = await getCustomerId(user.id);
  if (!customerId) return { ok: false, error: 'Customer record not found.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('customers')
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      postal_code: input.postal_code?.trim() || null,
    })
    .eq('id', customerId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/account');
  revalidatePath('/account/profile');
  return { ok: true };
}

/** Called from createOrder after a successful order to sync delivery info to profile. */
export async function syncProfileFromOrder(
  userId: string,
  data: { phone: string; address: string; city: string },
): Promise<void> {
  const admin = createAdminClient();
  const { data: cust } = await admin
    .from('customers')
    .select('id,phone,address,city')
    .eq('auth_uid', userId)
    .maybeSingle();
  if (!cust) return;
  // Only fill in fields that are currently empty.
  const patch: Record<string, string> = {};
  if (!cust.phone && data.phone) patch.phone = data.phone;
  if (!cust.address && data.address) patch.address = data.address;
  if (!cust.city && data.city) patch.city = data.city;
  if (Object.keys(patch).length > 0) {
    await admin.from('customers').update(patch).eq('id', cust.id);
  }
}

// ---------------------------------------------------------------------------
// Customer addresses
// ---------------------------------------------------------------------------

export interface AddressInput {
  id?: string;
  label: string;
  full_name: string;
  phone?: string;
  address: string;
  city: string;
  postal_code?: string;
  is_default: boolean;
}

export async function saveAddress(input: AddressInput): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const customerId = await getCustomerId(user.id);
  if (!customerId) return { ok: false, error: 'Customer record not found.' };

  if (!input.full_name.trim() || !input.address.trim() || !input.city.trim()) {
    return { ok: false, error: 'Full name, address and city are required.' };
  }

  const admin = createAdminClient();

  // If this is set as default, clear other defaults first.
  if (input.is_default) {
    await admin
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customerId);
  }

  const payload = {
    customer_id: customerId,
    label: input.label.trim() || 'Home',
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address.trim(),
    city: input.city.trim(),
    postal_code: input.postal_code?.trim() || null,
    is_default: input.is_default,
  };

  if (input.id) {
    const { error } = await admin
      .from('customer_addresses')
      .update(payload)
      .eq('id', input.id)
      .eq('customer_id', customerId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from('customer_addresses')
      .insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/account/addresses');
  revalidatePath('/account');
  return { ok: true };
}

export async function deleteAddress(id: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const customerId = await getCustomerId(user.id);
  if (!customerId) return { ok: false, error: 'Customer record not found.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('customer_addresses')
    .delete()
    .eq('id', id)
    .eq('customer_id', customerId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/account/addresses');
  revalidatePath('/account');
  return { ok: true };
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const customerId = await getCustomerId(user.id);
  if (!customerId) return { ok: false, error: 'Customer record not found.' };

  const admin = createAdminClient();
  await admin
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId);
  const { error } = await admin
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('customer_id', customerId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/account/addresses');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export interface TicketInput {
  phone?: string;
  subject: string;
  category: TicketCategory;
  order_id?: string;
  description: string;
}

export type TicketResult =
  | { ok: true; ticket_number: string; ticket_id: string }
  | { ok: false; error: string };

/** Generates a unique ticket number: TKT-YYYYMMDD-NNNN */
async function generateTicketNumber(): Promise<string> {
  const admin = createAdminClient();
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TKT-${dateStr}-`;
  const { count } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .like('ticket_number', `${prefix}%`);
  const seq = ((count ?? 0) + 1).toString().padStart(4, '0');
  return `${prefix}${seq}`;
}

export async function submitTicket(input: TicketInput): Promise<TicketResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (!input.subject.trim() || !input.description.trim()) {
    return { ok: false, error: 'Subject and description are required.' };
  }

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from('customers')
    .select('id,name,email')
    .eq('auth_uid', user.id)
    .maybeSingle();
  if (!customer) return { ok: false, error: 'Customer record not found.' };

  // Duplicate check: same customer + subject + description in last 60 seconds.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: existing } = await admin
    .from('support_tickets')
    .select('id')
    .eq('customer_id', customer.id)
    .eq('subject', input.subject.trim())
    .gte('created_at', since)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: 'A similar ticket was just submitted. Please wait a moment before trying again.' };
  }

  const ticketNumber = await generateTicketNumber();

  const { data: ticket, error } = await admin
    .from('support_tickets')
    .insert({
      ticket_number: ticketNumber,
      customer_id: customer.id,
      customer_name: customer.name ?? user.email ?? '',
      email: customer.email,
      phone: input.phone?.trim() || null,
      subject: input.subject.trim(),
      category: input.category,
      order_id: input.order_id?.trim() || null,
      description: input.description.trim(),
      status: 'open',
    })
    .select('id,ticket_number')
    .single();

  if (error || !ticket) return { ok: false, error: error?.message ?? 'Could not create ticket.' };

  // Fire n8n webhook (best-effort — ticket is already saved).
  await triggerTicketWebhook({
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    customer_name: customer.name ?? '',
    email: customer.email,
    phone: input.phone?.trim() ?? '',
    subject: input.subject.trim(),
    category: input.category,
    order_id: input.order_id?.trim() ?? null,
    description: input.description.trim(),
    submitted_at: new Date().toISOString(),
  });

  revalidatePath('/account/tickets');
  return { ok: true, ticket_number: ticket.ticket_number, ticket_id: ticket.id };
}

async function triggerTicketWebhook(payload: unknown) {
  const url = process.env.N8N_TICKET_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[n8n] ticket webhook failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are not signed in.' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: ticket status + notes
// ---------------------------------------------------------------------------

export async function adminUpdateTicketStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();
  const valid = ['open', 'in_progress', 'resolved', 'closed'];
  if (!valid.includes(status)) return { ok: false, error: 'Invalid status.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('support_tickets')
    .update({ status })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/tickets/${id}`);
  revalidatePath('/admin/tickets');
  return { ok: true };
}

export async function adminAddTicketNote(
  ticketId: string,
  note: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!note.trim()) return { ok: false, error: 'Note cannot be empty.' };

  const admin = createAdminClient();
  const { error } = await admin.from('ticket_notes').insert({
    ticket_id: ticketId,
    note: note.trim(),
    created_by: 'admin',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: order tracking events
// ---------------------------------------------------------------------------

export async function adminAddTrackingEvent(
  orderId: string,
  status: string,
  description: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!status.trim()) return { ok: false, error: 'Status is required.' };

  const admin = createAdminClient();
  const { error } = await admin.from('order_tracking_events').insert({
    order_id: orderId,
    status: status.trim(),
    description: description.trim() || null,
    created_by: 'admin',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/account/orders/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: CMS actions
// ---------------------------------------------------------------------------

export async function adminSavePage(
  slug: string,
  title: string,
  content: string,
  is_published: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  if (!title.trim()) return { ok: false, error: 'Title is required.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('cms_pages')
    .update({ title: title.trim(), content, is_published })
    .eq('slug', slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/pages');
  revalidatePath(`/pages/${slug}`);
  return { ok: true };
}

export async function adminSaveSocialLink(input: {
  id?: string;
  platform: string;
  url: string;
  is_active: boolean;
  sort_order: number;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.platform.trim() || !input.url.trim()) {
    return { ok: false, error: 'Platform and URL are required.' };
  }

  const admin = createAdminClient();
  if (input.id) {
    const { error } = await admin
      .from('social_links')
      .update({ platform: input.platform, url: input.url, is_active: input.is_active, sort_order: input.sort_order })
      .eq('id', input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from('social_links').insert({
      platform: input.platform.trim(),
      url: input.url.trim(),
      is_active: input.is_active,
      sort_order: input.sort_order,
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath('/admin/cms/social');
  revalidatePath('/');
  return { ok: true };
}

export async function adminDeleteSocialLink(id: string): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('social_links').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/social');
  revalidatePath('/');
  return { ok: true };
}

export async function adminSaveFeature(input: {
  id?: string;
  icon?: string;
  heading: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.heading.trim()) return { ok: false, error: 'Heading is required.' };

  const admin = createAdminClient();
  if (input.id) {
    const { error } = await admin.from('cms_features').update({
      icon: input.icon?.trim() || null,
      heading: input.heading.trim(),
      description: input.description?.trim() || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    }).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from('cms_features').insert({
      icon: input.icon?.trim() || null,
      heading: input.heading.trim(),
      description: input.description?.trim() || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath('/admin/cms/features');
  revalidatePath('/');
  return { ok: true };
}

export async function adminDeleteFeature(id: string): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('cms_features').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/features');
  revalidatePath('/');
  return { ok: true };
}

export async function adminSaveSiteSettings(input: {
  announcement_text: string;
  announcement_active: boolean;
  seo_title: string;
  meta_description: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('site_settings').update({
    announcement_text: input.announcement_text.trim() || null,
    announcement_active: input.announcement_active,
    seo_title: input.seo_title.trim() || null,
    meta_description: input.meta_description.trim() || null,
  }).eq('id', 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/site');
  revalidatePath('/');
  return { ok: true };
}

export async function adminUploadCmsAsset(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const file = formData.get('file');
  const field = String(formData.get('field') ?? '');
  if (!(file instanceof File)) return { ok: false, error: 'No file provided.' };

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${field}/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from('cms-assets')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cms-assets/${path}`;
  const updatePayload: Record<string, string> = {};
  if (field === 'logo') updatePayload.logo_url = url;
  if (field === 'favicon') updatePayload.favicon_url = url;
  if (Object.keys(updatePayload).length > 0) {
    await admin.from('site_settings').update(updatePayload).eq('id', 1);
  }

  revalidatePath('/admin/cms/site');
  revalidatePath('/');
  return { ok: true, url };
}
