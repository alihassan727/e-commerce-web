'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin';
import { getCurrentCustomer } from '@/lib/customer';
import { slugifyPage } from '@/lib/cms/defaults';
import { isUuid } from '@/lib/search';
import type { Customer, TicketCategory } from '@/lib/types';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const CMS_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const LOGO_IMAGE_TYPES: Record<string, string> = {
  ...CMS_IMAGE_TYPES,
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CustomerLookup = { customer: Customer } | { error: string };

/**
 * Returns the signed-in customer, recreating the row if it is missing.
 * Converts unexpected failures into an action error instead of a raw 500.
 */
async function requireCustomer(): Promise<CustomerLookup> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { error: 'Not signed in.' };
    return { customer };
  } catch (err) {
    console.error('[account] customer lookup failed:', err);
    return { error: 'Could not load your account. Please try again.' };
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Clears the Supabase session server-side. Kept as an action so the account
 * and navbar sign-out controls do not need to ship the browser Supabase SDK.
 */
export async function signOut(): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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
  const resolved = await requireCustomer();
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const customer = resolved.customer;

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
    .eq('id', customer.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/account');
  revalidatePath('/account/profile');
  return { ok: true };
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
  const resolved = await requireCustomer();
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const customer = resolved.customer;

  if (!input.full_name.trim() || !input.address.trim() || !input.city.trim()) {
    return { ok: false, error: 'Full name, address and city are required.' };
  }

  const admin = createAdminClient();

  // If this is set as default, clear other defaults first.
  if (input.is_default) {
    await admin
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customer.id);
  }

  const payload = {
    customer_id: customer.id,
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
      .eq('customer_id', customer.id);
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
  const resolved = await requireCustomer();
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const customer = resolved.customer;

  const admin = createAdminClient();
  const { error } = await admin
    .from('customer_addresses')
    .delete()
    .eq('id', id)
    .eq('customer_id', customer.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/account/addresses');
  revalidatePath('/account');
  return { ok: true };
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const resolved = await requireCustomer();
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const customer = resolved.customer;

  const admin = createAdminClient();
  await admin
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customer.id);
  const { error } = await admin
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('customer_id', customer.id);

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
  const resolved = await requireCustomer();
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const customer = resolved.customer;

  if (!input.subject.trim() || !input.description.trim()) {
    return { ok: false, error: 'Subject and description are required.' };
  }

  const admin = createAdminClient();

  // A related order may only be referenced when it belongs to this customer
  // (linked customer row, or a guest order placed with the same email).
  let relatedOrderId: string | null = null;
  const rawOrderId = input.order_id?.trim() ?? '';
  if (rawOrderId) {
    if (!isUuid(rawOrderId)) {
      return { ok: false, error: 'Enter a valid order ID or leave the field empty.' };
    }
    const { data: order } = await admin
      .from('orders')
      .select('id,customer_id,email')
      .eq('id', rawOrderId)
      .maybeSingle();
    const guestEmailMatches =
      order && order.customer_id === null &&
      String(order.email ?? '').toLowerCase() === customer.email.toLowerCase();
    if (!order || (order.customer_id !== customer.id && !guestEmailMatches)) {
      return { ok: false, error: 'That order does not belong to your account.' };
    }
    relatedOrderId = order.id as string;
  }

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
      customer_name: customer.name ?? customer.email ?? '',
      email: customer.email,
      phone: input.phone?.trim() || null,
      subject: input.subject.trim(),
      category: input.category,
      order_id: relatedOrderId,
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
    order_id: relatedOrderId,
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

export type PageSaveResult = { ok: true; slug: string } | { ok: false; error: string };

/** Rejects a submission whose content is empty once HTML markup is removed. */
function contentHasText(html: string | null | undefined): boolean {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim().length > 0;
}

function normalisePageSlug(raw: string): string {
  return slugifyPage(raw ?? '');
}

function revalidateCmsPage(slugs: string[]): void {
  revalidatePath('/admin/cms/pages');
  // The footer lists published pages, so the shared layout has to be refreshed.
  revalidatePath('/', 'layout');
  for (const slug of slugs) {
    if (!slug) continue;
    revalidatePath(`/pages/${slug}`);
    revalidatePath(`/${slug}`);
  }
}

/**
 * Creates a CMS page. Slugs are unique across published and draft pages so a
 * draft can never shadow a live URL.
 */
export async function adminCreatePage(input: {
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
}): Promise<PageSaveResult> {
  await requireAdmin();

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Page title is required.' };

  const slug = normalisePageSlug(input.slug || title);
  if (!slug) {
    return { ok: false, error: 'Enter a page URL using letters, numbers and hyphens.' };
  }
  const content = input.content ?? '';
  if (input.isPublished && !contentHasText(content)) {
    return { ok: false, error: 'Add some content before publishing this page.' };
  }

  const admin = createAdminClient();
  const { data: clash } = await admin
    .from('cms_pages')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (clash) return { ok: false, error: 'Another page already uses that URL.' };

  const { error } = await admin.from('cms_pages').insert({
    slug,
    title,
    content,
    is_published: input.isPublished,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'Another page already uses that URL.' : error.message,
    };
  }

  revalidateCmsPage([slug]);
  return { ok: true, slug };
}

/**
 * Saves an existing CMS page, including a slug change. Only the fields passed
 * in are written, so nothing else about the record is touched.
 */
export async function adminUpdatePage(input: {
  originalSlug: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
}): Promise<PageSaveResult> {
  await requireAdmin();

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Page title is required.' };

  const slug = normalisePageSlug(input.slug || title);
  if (!slug) {
    return { ok: false, error: 'Enter a page URL using letters, numbers and hyphens.' };
  }
  const content = input.content ?? '';
  if (input.isPublished && !contentHasText(content)) {
    return { ok: false, error: 'Add some content before publishing this page.' };
  }

  const admin = createAdminClient();
  const { data: existing, error: findError } = await admin
    .from('cms_pages')
    .select('id,slug')
    .eq('slug', input.originalSlug)
    .maybeSingle();
  if (findError) return { ok: false, error: findError.message };
  if (!existing) return { ok: false, error: 'This page no longer exists.' };

  if (slug !== existing.slug) {
    const { data: clash } = await admin
      .from('cms_pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (clash) return { ok: false, error: 'Another page already uses that URL.' };
  }

  const { error } = await admin
    .from('cms_pages')
    .update({ title, slug, content, is_published: input.isPublished })
    .eq('id', existing.id);
  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'Another page already uses that URL.' : error.message,
    };
  }

  revalidateCmsPage([existing.slug, slug]);
  return { ok: true, slug };
}

/** Publishes or unpublishes a page without touching its content. */
export async function adminSetPagePublished(
  slug: string,
  isPublished: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: page, error } = await admin
    .from('cms_pages')
    .select('id,slug,content')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!page) return { ok: false, error: 'This page no longer exists.' };
  if (isPublished && !contentHasText(page.content as string | null)) {
    return { ok: false, error: 'Add some content before publishing this page.' };
  }

  const { error: updateError } = await admin
    .from('cms_pages')
    .update({ is_published: isPublished })
    .eq('id', page.id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidateCmsPage([slug]);
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
  const { error } = await admin.from('site_settings').upsert({
    id: 1,
    announcement_text: input.announcement_text.trim() || null,
    announcement_active: input.announcement_active,
    seo_title: input.seo_title.trim() || null,
    meta_description: input.meta_description.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/site');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true };
}

export interface LogoBrandingInput {
  logo_mode: 'image' | 'text';
  logo_text: string;
  logo_font: string;
  logo_font_size: string;
  logo_font_weight: string;
  logo_color: string;
  logo_letter_spacing: string;
}

export async function adminSaveLogoBranding(
  input: LogoBrandingInput,
): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('site_settings').upsert({
    id:                   1,
    logo_mode:           input.logo_mode,
    logo_text:           input.logo_text.trim() || null,
    logo_font:           input.logo_font || 'serif',
    logo_font_size:      input.logo_font_size || '1.5rem',
    logo_font_weight:    input.logo_font_weight || '400',
    logo_color:          input.logo_color || '#1B1A18',
    logo_letter_spacing: input.logo_letter_spacing || 'normal',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/cms/site');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true };
}

export async function adminUploadCmsAsset(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const file = formData.get('file');
  const field = String(formData.get('field') ?? '');
  if (!(file instanceof File)) return { ok: false, error: 'No file provided.' };

  // Only these prefixes may be written to the public cms-assets bucket.
  // Category ids are UUIDs supplied by the admin UI.
  const isLogo = field === 'logo';
  const isFavicon = field === 'favicon';
  const isHero = field === 'hero-desktop' || field === 'hero-mobile';
  const isCategory = /^category-[0-9a-f-]{36}$/i.test(field);
  if (!isLogo && !isFavicon && !isHero && !isCategory) {
    return { ok: false, error: 'Invalid upload destination.' };
  }

  if (file.size === 0) return { ok: false, error: 'The selected file is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Images must be 8 MB or smaller.' };
  }
  const allowed = isLogo ? LOGO_IMAGE_TYPES : CMS_IMAGE_TYPES;
  const ext = allowed[file.type];
  if (!ext) {
    return { ok: false, error: 'Unsupported image type. Use JPEG, PNG, WebP or GIF.' };
  }

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
    await admin.from('site_settings').upsert({ id: 1, ...updatePayload });
  }

  revalidatePath('/admin/cms/site');
  revalidatePath('/');
  return { ok: true, url };
}
