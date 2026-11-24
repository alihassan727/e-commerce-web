'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sanitizeExt(ext: string): string {
  return /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductVariantInput {
  id?: string;
  size?: string;
  color?: string;
  stock: number;
  sku?: string;
}

export interface ProductInput {
  id?: string;
  title: string;
  slug?: string;
  description?: string;
  price: number;
  category_id?: string | null;
  has_variants: boolean;
  stock?: number | null;
  is_featured?: boolean;
  is_active?: boolean;
  variants?: ProductVariantInput[];
}

export type ProductSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function saveProduct(
  input: ProductInput,
): Promise<ProductSaveResult> {
  await requireAdmin();
  const admin = createAdminClient();

  if (!input.title?.trim()) return { ok: false, error: 'Title is required.' };

  let slug = slugify(input.slug || input.title) || 'product';
  let uniqueSlug = slug;
  let suffix = 1;
  for (;;) {
    let q = admin.from('products').select('id').eq('slug', uniqueSlug);
    if (input.id) q = q.neq('id', input.id);
    const { data } = await q;
    if (!data || data.length === 0) break;
    uniqueSlug = `${slug}-${suffix++}`;
  }

  const payload = {
    title: input.title.trim(),
    slug: uniqueSlug,
    description: input.description?.trim() || null,
    price: Math.max(0, Number(input.price) || 0),
    category_id: input.category_id || null,
    has_variants: !!input.has_variants,
    stock: input.has_variants ? null : Math.max(0, Math.floor(Number(input.stock ?? 0))),
    is_featured: !!input.is_featured,
    is_active: input.is_active ?? true,
  };

  let productId: string;
  if (input.id) {
    const { error } = await admin.from('products').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    productId = input.id;
  } else {
    const { data, error } = await admin
      .from('products')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create product.' };
    productId = data.id;
  }

  // Reconcile variants: update existing, insert new, delete removed.
  if (input.has_variants) {
    const incoming = input.variants ?? [];
    const { data: existing } = await admin
      .from('variants')
      .select('id')
      .eq('product_id', productId);
    const existingIds = (existing ?? []).map((v) => v.id);
    const incomingIds = incoming.map((v) => v.id).filter(Boolean) as string[];
    const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
    if (toDelete.length) {
      await admin.from('variants').delete().in('id', toDelete);
    }
    for (const v of incoming) {
      const row = {
        product_id: productId,
        size: v.size?.trim() || null,
        color: v.color?.trim() || null,
        stock: Math.max(0, Math.floor(Number(v.stock ?? 0))),
        sku: v.sku?.trim() || null,
      };
      if (v.id) {
        await admin.from('variants').update(row).eq('id', v.id);
      } else {
        await admin.from('variants').insert(row);
      }
    }
  } else {
    // No variants: clear any existing variant rows.
    await admin.from('variants').delete().eq('product_id', productId);
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath('/admin/products');
  revalidatePath('/');
  return { ok: true, id: productId };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteProduct(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: images } = await admin
    .from('product_images')
    .select('storage_path')
    .eq('product_id', id);
  if (images && images.length) {
    await admin.storage
      .from('product-images')
      .remove(images.map((i) => i.storage_path));
  }

  const { error } = await admin.from('products').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/products');
  revalidatePath('/');
  return { ok: true };
}

export type ImageUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function uploadProductImage(
  formData: FormData,
): Promise<ImageUploadResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const file = formData.get('file');
  const productId = String(formData.get('product_id') ?? '');
  if (!(file instanceof File) || !productId) {
    return { ok: false, error: 'Missing file or product.' };
  }

  const { count } = await admin
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);
  const sortOrder = (count ?? 0) + 1;

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? '';
  const ext = sanitizeExt(rawExt);
  const path = `${productId}/${Date.now()}-${sortOrder}.${ext}`;

  const { error: upErr } = await admin.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type || 'image/*', upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insertErr } = await admin
    .from('product_images')
    .insert({ product_id: productId, storage_path: path, sort_order: sortOrder });
  if (insertErr) {
    await admin.storage.from('product-images').remove([path]);
    return { ok: false, error: insertErr.message };
  }

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, path };
}

export async function removeProductImage(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from('product_images')
    .select('storage_path,product_id')
    .eq('id', id)
    .maybeSingle();
  if (data?.storage_path) {
    await admin.storage.from('product-images').remove([data.storage_path]);
  }
  const productId = (data as { product_id?: string } | null)?.product_id;
  await admin.from('product_images').delete().eq('id', id);

  if (productId) revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryInput {
  id?: string;
  name: string;
  slug?: string;
  sort_order: number;
  is_active: boolean;
}

export async function saveCategory(
  input: CategoryInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  if (!input.name?.trim()) return { ok: false, error: 'Name is required.' };

  let slug = slugify(input.slug || input.name) || 'category';
  let uniqueSlug = slug;
  let suffix = 1;
  for (;;) {
    let q = admin.from('categories').select('id').eq('slug', uniqueSlug);
    if (input.id) q = q.neq('id', input.id);
    const { data } = await q;
    if (!data || data.length === 0) break;
    uniqueSlug = `${slug}-${suffix++}`;
  }

  const payload = {
    name: input.name.trim(),
    slug: uniqueSlug,
    sort_order: Math.max(0, Math.floor(Number(input.sort_order ?? 0))),
    is_active: !!input.is_active,
  };

  let id: string;
  if (input.id) {
    const { error } = await admin.from('categories').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    id = input.id;
  } else {
    const { data, error } = await admin
      .from('categories')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create category.' };
    id = data.id;
  }

  revalidatePath('/admin/categories');
  revalidatePath('/');
  return { ok: true, id };
}

export async function deleteCategory(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('categories').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/categories');
  revalidatePath('/');
  return { ok: true };
}

export async function moveCategory(
  id: string,
  direction: 'up' | 'down',
): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: all } = await admin
    .from('categories')
    .select('id,sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  const list = (all ?? []) as { id: string; sort_order: number }[];

  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: true };
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const a = list[idx];
  const b = list[swapIdx];
  await admin.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id);
  await admin.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id);

  revalidatePath('/admin/categories');
  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const VALID_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'out_of_stock',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export async function updateOrderStatus(
  id: string,
  status: string,
): Promise<DeleteResult> {
  await requireAdmin();

  // Client-side guard: reject values not in the full enum set before hitting
  // the DB. The RPC also validates, but this avoids a network round-trip for
  // obviously wrong values.
  if (!VALID_ORDER_STATUSES.includes(status as (typeof VALID_ORDER_STATUSES)[number])) {
    return { ok: false, error: 'Invalid status.' };
  }

  const admin = createAdminClient();

  // Call the atomic admin_update_order_status RPC. This locks the order row
  // (same lock as confirm_order), checks the audit trail for prior
  // confirmation, enforces explicit transition rules, and applies the update
  // in one transaction. All three steps (read current status, check audit,
  // write status) are atomic so they cannot race with confirm_order.
  const { data, error } = await admin.rpc('admin_update_order_status', {
    p_order_id: id,
    p_status: status,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // .rpc() returns the first row of the RETURNS TABLE result set.
  const row = (data as { ok: boolean; status: string; message: string }[] | null)?.[0];
  if (!row) {
    return { ok: false, error: 'Status update returned no result from the database.' };
  }
  if (!row.ok) {
    return { ok: false, error: row.message };
  }

  revalidatePath(`/admin/orders/${id}`);
  revalidatePath('/admin/orders');
  revalidatePath('/admin');
  revalidatePath(`/order/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Homepage sections
// ---------------------------------------------------------------------------

export interface HomepageSectionInput {
  id?: string;
  type: 'hero' | 'category' | 'featured';
  category_id?: string | null;
  title?: string | null;
  config?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
}

export async function saveHomepageSection(
  input: HomepageSectionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  if (!['hero', 'category', 'featured'].includes(input.type)) {
    return { ok: false, error: 'Invalid section type.' };
  }
  if (input.type === 'category' && !input.category_id) {
    return { ok: false, error: 'Pick a category for a category section.' };
  }

  let sort_order = input.sort_order;
  if (!input.id && (sort_order === undefined || sort_order === null)) {
    const { count } = await admin
      .from('homepage_sections')
      .select('id', { count: 'exact', head: true });
    sort_order = (count ?? 0) + 1;
  }

  const payload = {
    type: input.type,
    category_id: input.type === 'category' ? input.category_id : null,
    title: input.title?.trim() || null,
    config: input.config ?? {},
    is_active: input.is_active ?? true,
    sort_order: sort_order ?? 0,
  };

  let id: string;
  if (input.id) {
    const { error } = await admin.from('homepage_sections').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    id = input.id;
  } else {
    const { data, error } = await admin
      .from('homepage_sections')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create section.' };
    id = data.id;
  }

  revalidatePath('/admin/homepage');
  revalidatePath('/');
  return { ok: true, id };
}

export async function deleteHomepageSection(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('homepage_sections').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/homepage');
  revalidatePath('/');
  return { ok: true };
}

export async function moveHomepageSection(
  id: string,
  direction: 'up' | 'down',
): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: all } = await admin
    .from('homepage_sections')
    .select('id,sort_order')
    .order('sort_order', { ascending: true });
  const list = (all ?? []) as { id: string; sort_order: number }[];

  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: true };
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const a = list[idx];
  const b = list[swapIdx];
  await admin.from('homepage_sections').update({ sort_order: b.sort_order }).eq('id', a.id);
  await admin.from('homepage_sections').update({ sort_order: a.sort_order }).eq('id', b.id);

  revalidatePath('/admin/homepage');
  revalidatePath('/');
  return { ok: true };
}

export async function toggleHomepageSection(
  id: string,
  is_active: boolean,
): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('homepage_sections').update({ is_active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/homepage');
  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Site settings — button color
// ---------------------------------------------------------------------------

export async function saveButtonColor(color: string): Promise<DeleteResult> {
  await requireAdmin();
  // Validate it is a valid 3 or 6-digit hex color.
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim())) {
    return { ok: false, error: 'Invalid hex color. Use format #A8472D.' };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('site_settings')
    .update({ button_color: color.trim().toUpperCase() })
    .eq('id', 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/admin/settings');
  revalidatePath('/admin/cms/site');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payment gateway configuration (server-side only)
// ---------------------------------------------------------------------------

const GATEWAY_FIELD_ALLOWLISTS: Record<string, string[]> = {
  safepay: ['environment', 'public_key', 'secret_key', 'webhook_secret'],
  payfast: ['environment', 'merchant_id', 'secured_key'],
};

export async function savePaymentGateway(
  gateway: string,
  credentials: Record<string, string>,
): Promise<DeleteResult> {
  await requireAdmin();

  const allowed = GATEWAY_FIELD_ALLOWLISTS[gateway];
  if (!allowed) return { ok: false, error: 'Unknown gateway.' };

  // Strip any fields not in the allowlist to prevent storing arbitrary data.
  const sanitized: Record<string, string> = {};
  for (const key of allowed) {
    if (credentials[key] !== undefined) {
      sanitized[key] = String(credentials[key]).trim();
    }
  }

  // Validate environment field if present.
  if (sanitized.environment && !['sandbox', 'live'].includes(sanitized.environment)) {
    return { ok: false, error: 'Environment must be sandbox or live.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('payment_gateway_config')
    .update({ credentials: sanitized })
    .eq('gateway', gateway);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/payments');
  return { ok: true };
}

export interface SettingsInput {
  store_name: string;
  contact_email: string;
  contact_phone: string;
  currency: string;
  delivery_fee: number;
  delivery_areas: string[];
  low_stock_threshold: number;
  cod_notes: string;
}

export async function saveSettings(
  input: SettingsInput,
): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const payload = {
    id: 1,
    store_name: input.store_name?.trim() || 'Store',
    contact_email: input.contact_email?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    currency: input.currency?.trim() || 'PKR',
    delivery_fee: Math.max(0, Number(input.delivery_fee) || 0),
    delivery_areas: (input.delivery_areas ?? []).map((a) => a.trim()).filter(Boolean),
    low_stock_threshold: Math.max(0, Math.floor(Number(input.low_stock_threshold) || 0)),
    cod_notes: input.cod_notes?.trim() || null,
  };

  const { error } = await admin.from('site_settings').upsert(payload).eq('id', 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/settings');
  revalidatePath('/');
  return { ok: true };
}
