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

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Allowed product-image MIME types mapped to their storage extension. The
// storage path and content type are derived from this allowlist rather than
// from the client-supplied filename, so a crafted upload cannot land an
// executable text/html (or SVG) file in the public bucket.
const PRODUCT_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function imageUploadError(
  file: File,
  allowed: Record<string, string>,
): string | null {
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Images must be 8 MB or smaller.';
  if (!allowed[file.type]) {
    return 'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductSizeInput {
  id?: string;
  size: string;
  stock: number;
  sku?: string;
  is_active?: boolean;
}

export interface ProductColorInput {
  /** Client-generated stable key used to map uploads back to the saved color. */
  key: string;
  /** Existing color id when editing. */
  id?: string;
  name: string;
  color_hex?: string;
  title?: string;
  sku?: string;
  regular_price: number;
  sale_price?: number | null;
  is_active?: boolean;
  sizes: ProductSizeInput[];
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
  colors?: ProductColorInput[];
}

export type ProductSaveResult =
  | { ok: true; id: string; colorIds: Record<string, string> }
  | { ok: false; error: string; id?: string };

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

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
    // Update first; if the row does not exist yet (first create with a
    // client-generated id), insert with that same id so retries are idempotent.
    const { data: updated, error } = await admin
      .from('products')
      .update(payload)
      .eq('id', input.id)
      .select('id');
    if (error) return { ok: false, error: error.message, id: input.id };
    if (updated && updated.length > 0) {
      productId = input.id;
    } else {
      const { data, error: insErr } = await admin
        .from('products')
        .insert({ ...payload, id: input.id })
        .select('id')
        .single();
      if (insErr || !data) {
        return { ok: false, error: insErr?.message ?? 'Could not create product.' };
      }
      productId = data.id;
    }
  } else {
    const { data, error } = await admin
      .from('products')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create product.' };
    productId = data.id;
  }

  const colorIds: Record<string, string> = {};

  if (!input.has_variants) {
    // Soft-delete: deactivate colors and size variants instead of deleting rows.
    // This preserves ids, stock, SKUs, FK references and historical orders, and
    // avoids any race with confirm_order / new order creation.
    await admin
      .from('variants')
      .update({ is_active: false })
      .eq('product_id', productId);
    await admin
      .from('product_colors')
      .update({ is_active: false })
      .eq('product_id', productId);
  } else {
    const incoming = input.colors ?? [];

    if (incoming.length === 0) {
      return {
        ok: false,
        error: 'Add at least one color for a product with variants.',
        id: productId,
      };
    }

    // Validate colors before touching the DB.
    const seenNames = new Set<string>();
    for (const c of incoming) {
      const name = c.name?.trim();
      if (!name) return { ok: false, error: 'Every color needs a name.' };
      const key = normalizeName(name);
      if (seenNames.has(key)) {
        return { ok: false, error: `Duplicate color name: ${name}.` };
      }
      seenNames.add(key);
      const regular = Number(c.regular_price);
      if (!Number.isFinite(regular) || regular < 0) {
        return { ok: false, error: `Regular price for ${name} must be 0 or more.` };
      }
      if (c.sale_price != null && Number(c.sale_price) > 0) {
        if (Number(c.sale_price) >= regular) {
          return {
            ok: false,
            error: `Sale price for ${name} must be lower than the regular price.`,
          };
        }
      }
    }

    // Reconcile colors idempotently: match incoming colors to existing rows by
    // id first, then by normalized name, so a retry never creates duplicates.
    const { data: existingColors } = await admin
      .from('product_colors')
      .select('id,name')
      .eq('product_id', productId);
    const existingColorRows = (existingColors ?? []) as { id: string; name: string }[];

    const resolvedColors = incoming.map((c) => {
      const name = c.name.trim();
      let targetId = c.id;
      if (!targetId) {
        const match = existingColorRows.find(
          (ec) => normalizeName(ec.name) === normalizeName(name),
        );
        if (match) targetId = match.id;
      }
      return { c, name, targetId };
    });

    const incomingColorIds = resolvedColors
      .map((r) => r.targetId)
      .filter(Boolean) as string[];
    const removedColorIds = existingColorRows
      .map((ec) => ec.id)
      .filter((id) => !incomingColorIds.includes(id));
    if (removedColorIds.length) {
      // Soft-delete: deactivate the color and its size variants. Rows, stock,
      // SKUs, images and historical order references are all preserved.
      await admin
        .from('variants')
        .update({ is_active: false })
        .in('color_id', removedColorIds);
      await admin
        .from('product_colors')
        .update({ is_active: false })
        .in('id', removedColorIds);
    }

    for (const [colorIndex, r] of resolvedColors.entries()) {
      const c = r.c;
      const name = r.name;
      const row = {
        product_id: productId,
        name,
        color_hex: c.color_hex?.trim() || null,
        title: c.title?.trim() || null,
        sku: c.sku?.trim() || null,
        regular_price: Math.max(0, Number(c.regular_price) || 0),
        sale_price:
          c.sale_price != null && Number(c.sale_price) > 0
            ? Number(c.sale_price)
            : null,
        is_active: c.is_active ?? true,
        sort_order: colorIndex,
      };

      let colorId: string;
      if (r.targetId) {
        const { error } = await admin
          .from('product_colors')
          .update(row)
          .eq('id', r.targetId)
          .eq('product_id', productId);
        if (error) return { ok: false, error: error.message, id: productId };
        colorId = r.targetId;
      } else {
        const { data, error } = await admin
          .from('product_colors')
          .insert(row)
          .select('id')
          .single();
        if (error || !data) {
          return {
            ok: false,
            error: error?.message ?? `Could not save color ${name}.`,
            id: productId,
          };
        }
        colorId = data.id;
      }
      colorIds[c.key] = colorId;

      // Reconcile size-level variants for this color.
      const sizes = c.sizes ?? [];
      const { data: existingVariants } = await admin
        .from('variants')
        .select('id,size')
        .eq('color_id', colorId);
      const existingVariantRows = (existingVariants ?? []) as {
        id: string;
        size: string | null;
      }[];

      // Match incoming sizes to existing rows by id, then by size name, so a
      // retry updates the same variant instead of inserting a duplicate.
      const resolvedSizes = sizes.map((s) => {
        let vid = s.id;
        if (!vid) {
          const match = existingVariantRows.find(
            (ev) => normalizeName(ev.size ?? '') === normalizeName(s.size ?? ''),
          );
          if (match) vid = match.id;
        }
        return { s, vid };
      });

      const keepIds = resolvedSizes
        .map((x) => x.vid)
        .filter(Boolean) as string[];
      const toDeleteVariants = existingVariantRows
        .map((ev) => ev.id)
        .filter((id) => !keepIds.includes(id));
      if (toDeleteVariants.length) {
        // Soft-delete removed sizes: deactivate, never delete the row.
        await admin
          .from('variants')
          .update({ is_active: false })
          .in('id', toDeleteVariants);
      }
      for (const { s, vid } of resolvedSizes) {
        const sizeName = s.size?.trim() || null;
        const vrow = {
          product_id: productId,
          color_id: colorId,
          size: sizeName,
          color: name,
          color_hex: row.color_hex,
          stock: Math.max(0, Math.floor(Number(s.stock ?? 0))),
          sku: s.sku?.trim() || null,
          is_active: s.is_active ?? row.is_active,
        };
        if (vid) {
          await admin.from('variants').update(vrow).eq('id', vid);
        } else {
          await admin.from('variants').insert(vrow);
        }
      }
    }
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath('/admin/products');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true, id: productId, colorIds };
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

  // Remove per-color image files before the rows cascade away.
  const { data: colorImages } = await admin
    .from('color_images')
    .select('storage_path, product_colors!inner(product_id)')
    .eq('product_colors.product_id', id);
  if (colorImages && colorImages.length) {
    await admin.storage
      .from('product-images')
      .remove(colorImages.map((i) => i.storage_path));
  }

  const { error } = await admin.from('products').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/products');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true };
}

export interface UploadedImageRow {
  id: string;
  storage_path: string;
  sort_order: number;
}

export type ImageUploadResult =
  | { ok: true; path: string; image: UploadedImageRow }
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

  const validationError = imageUploadError(file, PRODUCT_IMAGE_TYPES);
  if (validationError) return { ok: false, error: validationError };

  const { count } = await admin
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);
  const sortOrder = (count ?? 0) + 1;

  const ext = PRODUCT_IMAGE_TYPES[file.type];
  const path = `${productId}/${Date.now()}-${sortOrder}.${ext}`;

  const { error: upErr } = await admin.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: inserted, error: insertErr } = await admin
    .from('product_images')
    .insert({ product_id: productId, storage_path: path, sort_order: sortOrder })
    .select('id,storage_path,sort_order')
    .single();
  if (insertErr || !inserted) {
    await admin.storage.from('product-images').remove([path]);
    return { ok: false, error: insertErr?.message ?? 'Could not save the image.' };
  }

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, path, image: inserted as UploadedImageRow };
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

/**
 * Uploads an image into a specific color's gallery. Uses the same
 * `product-images` bucket and path conventions as product-level uploads:
 *   <productId>/<colorId>/<timestamp>-<sortOrder>.<ext>
 */
export async function uploadColorImage(
  formData: FormData,
): Promise<ImageUploadResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const file = formData.get('file');
  const colorId = String(formData.get('color_id') ?? '');
  if (!(file instanceof File) || !colorId) {
    return { ok: false, error: 'Missing file or color.' };
  }

  const validationError = imageUploadError(file, PRODUCT_IMAGE_TYPES);
  if (validationError) return { ok: false, error: validationError };

  const { data: color } = await admin
    .from('product_colors')
    .select('id,product_id')
    .eq('id', colorId)
    .maybeSingle();
  if (!color) return { ok: false, error: 'Color not found.' };

  const { count } = await admin
    .from('color_images')
    .select('id', { count: 'exact', head: true })
    .eq('color_id', colorId);
  const sortOrder = (count ?? 0) + 1;

  const ext = PRODUCT_IMAGE_TYPES[file.type];
  const path = `${color.product_id}/${colorId}/${Date.now()}-${sortOrder}.${ext}`;

  const { error: upErr } = await admin.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: inserted, error: insertErr } = await admin
    .from('color_images')
    .insert({ color_id: colorId, storage_path: path, sort_order: sortOrder })
    .select('id,storage_path,sort_order')
    .single();
  if (insertErr || !inserted) {
    await admin.storage.from('product-images').remove([path]);
    return { ok: false, error: insertErr?.message ?? 'Could not save the image.' };
  }

  revalidatePath(`/admin/products/${color.product_id}`);
  revalidatePath('/product/[slug]', 'page');
  return { ok: true, path, image: inserted as UploadedImageRow };
}

export async function removeColorImage(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from('color_images')
    .select('storage_path, product_colors!inner(product_id)')
    .eq('id', id)
    .maybeSingle();
  if (data?.storage_path) {
    await admin.storage.from('product-images').remove([data.storage_path]);
  }
  const productId = (data as { product_colors?: { product_id: string } } | null)
    ?.product_colors?.product_id;
  await admin.from('color_images').delete().eq('id', id);

  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath('/product/[slug]', 'page');
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
  revalidatePath('/shop');
  revalidatePath('/category');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true, id };
}

export async function deleteCategory(id: string): Promise<DeleteResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from('categories').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/categories');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
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

  // Reindex the whole (already ordered) list after the swap. Swapping only the
  // two stored sort_order values is a no-op when categories share a value
  // (e.g. several newly created rows default to 0).
  const ordered = list.slice();
  const [moved] = ordered.splice(idx, 1);
  ordered.splice(swapIdx, 0, moved);
  await Promise.all(
    ordered.map((row, index) =>
      admin.from('categories').update({ sort_order: index }).eq('id', row.id),
    ),
  );

  revalidatePath('/admin/categories');
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category');
  revalidatePath('/category/[slug]', 'page');
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
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${id}`);
  revalidatePath('/product/[slug]', 'page');
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

  const isCategoryBoxes = input.type === 'category' && input.config?.kind === 'category_boxes';
  if (!['hero', 'category', 'featured'].includes(input.type)) {
    return { ok: false, error: 'Invalid section type.' };
  }
  if (input.type === 'category' && !isCategoryBoxes && !input.category_id) {
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
    category_id: input.type === 'category' && !isCategoryBoxes ? input.category_id : null,
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

  // Reindex the whole list after the move so sections with duplicate
  // sort_order values still reorder deterministically.
  const ordered = list.slice();
  const [moved] = ordered.splice(idx, 1);
  ordered.splice(swapIdx, 0, moved);
  await Promise.all(
    ordered.map((row, index) =>
      admin.from('homepage_sections').update({ sort_order: index }).eq('id', row.id),
    ),
  );

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
    .upsert({ id: 1, button_color: color.trim().toUpperCase() });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/shop');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
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

// Secret fields are never sent to the browser. A blank value means "keep the
// saved secret", and the merge below happens entirely on the server.
const GATEWAY_SECRET_FIELDS: Record<string, string[]> = {
  safepay: ['secret_key', 'webhook_secret'],
  payfast: ['secured_key'],
};

export async function savePaymentGateway(
  gateway: string,
  credentials: Record<string, string>,
): Promise<DeleteResult> {
  await requireAdmin();

  const allowed = GATEWAY_FIELD_ALLOWLISTS[gateway];
  if (!allowed) return { ok: false, error: 'Unknown gateway.' };
  const secretFields = new Set(GATEWAY_SECRET_FIELDS[gateway] ?? []);

  const admin = createAdminClient();
  const { data: existingRow } = await admin
    .from('payment_gateway_config')
    .select('credentials')
    .eq('gateway', gateway)
    .maybeSingle();
  const current = (existingRow?.credentials ?? {}) as Record<string, string>;

  // Strip any fields not in the allowlist to prevent storing arbitrary data.
  // Secrets left blank keep their saved value (the edit form never receives it).
  const sanitized: Record<string, string> = {};
  for (const key of allowed) {
    const incoming = credentials[key];
    const value = incoming === undefined ? undefined : String(incoming).trim();

    if (secretFields.has(key)) {
      if (value) sanitized[key] = value;
      else if (current[key]) sanitized[key] = current[key];
      continue;
    }
    if (value !== undefined) sanitized[key] = value;
  }

  // Validate environment field if present.
  if (sanitized.environment && !['sandbox', 'live'].includes(sanitized.environment)) {
    return { ok: false, error: 'Environment must be sandbox or live.' };
  }

  const { error } = await admin
    .from('payment_gateway_config')
    .upsert({ gateway, credentials: sanitized }, { onConflict: 'gateway' });
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
  revalidatePath('/shop');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/product/[slug]', 'page');
  return { ok: true };
}
