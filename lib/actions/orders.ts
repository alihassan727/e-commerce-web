'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ensureCustomerForUser } from '@/lib/customer';
import { getEffectivePrice } from '@/lib/pricing';
import { getStorageUrl } from '@/lib/storage';

export interface CreateOrderInput {
  items: {
    product_id: string;
    variant_id: string | null;
    quantity: number;
  }[];
  customer: {
    name: string;
    email: string;
    phone: string;
    alternate_phone?: string;
    address: string;
    city: string;
    delivery_instructions?: string;
    preferred_delivery_time?: string;
  };
}

export type CreateOrderResult =
  | { ok: true; orderId: string; email: string }
  | { ok: false; error: string };

interface VariantRow {
  id: string;
  product_id: string;
  color_id: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  is_active: boolean;
}

interface ColorRow {
  id: string;
  product_id: string;
  name: string;
  regular_price: number;
  sale_price: number | null;
  is_active: boolean;
}

/**
 * Creates a COD order (status pending) and fires the n8n stock-check webhook.
 * Prices and totals are recomputed from the database so the client cannot set
 * them. Stock is NOT deducted here: n8n checks stock and sets the order to
 * confirmed or out_of_stock. The webhook call is best-effort; the order stays
 * pending if n8n is unreachable.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const c = input.customer;

  if (!input.items.length) return { ok: false, error: 'Your cart is empty.' };
  if (input.items.length > 50) {
    return { ok: false, error: 'Your cart has too many different items. Please split the order.' };
  }
  if (
    !c.name?.trim() ||
    !c.email?.trim() ||
    !c.phone?.trim() ||
    !c.address?.trim() ||
    !c.city?.trim()
  ) {
    return {
      ok: false,
      error: 'Please fill in your name, email, phone, address and city.',
    };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const admin = createAdminClient();

  // Site settings: delivery fee, currency, delivery areas.
  const { data: settings } = await admin
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  const deliveryFee = Number(settings?.delivery_fee ?? 0);
  const deliveryAreas: string[] = (settings?.delivery_areas as string[]) ?? [];
  if (
    deliveryAreas.length > 0 &&
    !deliveryAreas
      .map((a) => a.toLowerCase())
      .includes(c.city.trim().toLowerCase())
  ) {
    return { ok: false, error: `We do not deliver to ${c.city} yet.` };
  }

  // Resolve products/variants/colors from the DB in a small number of batched
  // queries (no per-item round-trips), snapshot titles, and price server-side.
  const productIds = Array.from(new Set(input.items.map((it) => it.product_id)));
  const variantIds = Array.from(
    new Set(input.items.map((it) => it.variant_id).filter(Boolean)),
  ) as string[];

  const { data: productRows } = await admin
    .from('products')
    .select('id,title,slug,price,has_variants,stock,is_active')
    .in('id', productIds);
  const productMap = new Map(
    (productRows ?? []).map((p) => [p.id as string, p]),
  );

  const variantMap = new Map<string, VariantRow>();
  if (variantIds.length > 0) {
    const { data: variantRows } = await admin
      .from('variants')
      .select('id,product_id,color_id,size,color,stock,is_active')
      .in('id', variantIds);
    for (const v of variantRows ?? []) {
      variantMap.set(v.id as string, v as VariantRow);
    }
  }

  const { data: colorRows } = await admin
    .from('product_colors')
    .select('id,product_id,name,regular_price,sale_price,is_active')
    .in('product_id', productIds);
  const colorsByProduct = new Map<string, ColorRow[]>();
  for (const c of colorRows ?? []) {
    const row = c as ColorRow;
    const arr = colorsByProduct.get(row.product_id) ?? [];
    arr.push(row);
    colorsByProduct.set(row.product_id, arr);
  }

  // Batch image lookups for snapshots (color gallery first, product-level fallback).
  const colorIds = (colorRows ?? []).map((c) => c.id as string);
  const colorImageMap = new Map<string, string>();
  if (colorIds.length > 0) {
    const { data: colorImages } = await admin
      .from('color_images')
      .select('color_id,storage_path')
      .in('color_id', colorIds)
      .order('sort_order', { ascending: true });
    for (const img of colorImages ?? []) {
      const key = img.color_id as string;
      if (!colorImageMap.has(key)) colorImageMap.set(key, img.storage_path as string);
    }
  }
  const productImageMap = new Map<string, string>();
  {
    const { data: productImages } = await admin
      .from('product_images')
      .select('product_id,storage_path')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true });
    for (const img of productImages ?? []) {
      const key = img.product_id as string;
      if (!productImageMap.has(key)) productImageMap.set(key, img.storage_path as string);
    }
  }

  const resolvedItems: {
    product_id: string;
    variant_id: string | null;
    title: string;
    variant_label: string | null;
    color_snapshot: string | null;
    size_snapshot: string | null;
    image_snapshot_url: string | null;
    price: number;
    quantity: number;
    line_total: number;
  }[] = [];
  let subtotal = 0;

  for (const it of input.items) {
    const product = productMap.get(it.product_id);
    if (!product || !product.is_active) {
      return { ok: false, error: 'One of the items is no longer available.' };
    }

    // A product that offers colours must be ordered through a specific
    // colour/size variant. Without this, omitting variant_id would fall back
    // to the base product price and bypass the colour-level price/stock.
    const productColorsForItem = colorsByProduct.get(it.product_id) ?? [];
    if (
      product.has_variants &&
      productColorsForItem.some((c) => c.is_active) &&
      !it.variant_id
    ) {
      return {
        ok: false,
        error: 'Please choose a colour and size for every item before checking out.',
      };
    }

    let color: {
      id: string;
      name: string;
      regular_price: number;
      sale_price: number | null;
      is_active: boolean;
    } | null = null;
    let variantLabel: string | null = null;
    let colorSnapshot: string | null = null;
    let sizeSnapshot: string | null = null;

    if (it.variant_id) {
      const variant = variantMap.get(it.variant_id);
      if (!variant || variant.product_id !== it.product_id || !variant.is_active) {
        return { ok: false, error: 'A selected variant is no longer available.' };
      }
      const productColors = colorsByProduct.get(it.product_id) ?? [];
      color =
        productColors.find((c) => c.id === variant.color_id && c.is_active) ?? null;
      if (variant.color_id && !color) {
        return { ok: false, error: 'A selected color is no longer available.' };
      }
      const colorName = color?.name ?? variant.color;
      variantLabel = [variant.size, colorName].filter(Boolean).join(' / ');
      colorSnapshot = colorName;
      sizeSnapshot = variant.size;
    }

    // Color-level price is the source of truth; fall back to the product price
    // for simple products or legacy variants without a color.
    const price = color
      ? getEffectivePrice(color.regular_price, color.sale_price)
      : Number(product.price);
    const quantity = Math.min(99, Math.max(1, Math.floor(it.quantity)));
    const lineTotal = price * quantity;
    subtotal += lineTotal;

    const imagePath = color
      ? colorImageMap.get(color.id) ?? productImageMap.get(it.product_id) ?? null
      : productImageMap.get(it.product_id) ?? null;

    resolvedItems.push({
      product_id: product.id,
      variant_id: it.variant_id,
      title: product.title,
      variant_label: variantLabel,
      color_snapshot: colorSnapshot,
      size_snapshot: sizeSnapshot,
      image_snapshot_url: imagePath
        ? getStorageUrl('product-images', imagePath)
        : null,
      price,
      quantity,
      line_total: lineTotal,
    });
  }

  const total = subtotal + deliveryFee;

  // Link to a customer row when the user is signed in.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let customerId: string | null = null;
  if (user) {
    try {
      customerId = (await ensureCustomerForUser(user)).id;
    } catch (err) {
      // Never block an order on profile repair; account order lists also match
      // unlinked orders by email.
      console.error('[orders] customer lookup failed:', err);
    }
  }

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      customer_id: customerId,
      status: 'pending',
      customer_name: c.name.trim(),
      email: c.email.trim().toLowerCase(),
      phone: c.phone.trim(),
      alternate_phone: c.alternate_phone?.trim() || null,
      address: c.address.trim(),
      city: c.city.trim(),
      delivery_instructions: c.delivery_instructions?.trim() || null,
      preferred_delivery_time: c.preferred_delivery_time?.trim() || null,
      subtotal,
      delivery_fee: deliveryFee,
      total,
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    return {
      ok: false,
      error: 'Could not create your order. Please try again.',
    };
  }

  const orderId = order.id as string;

  await admin.from('order_items').insert(
    resolvedItems.map((it) => ({
      order_id: orderId,
      product_id: it.product_id,
      variant_id: it.variant_id,
      title_snapshot: it.title,
      variant_label_snapshot: it.variant_label,
      color_snapshot: it.color_snapshot,
      size_snapshot: it.size_snapshot,
      image_snapshot_url: it.image_snapshot_url,
      price: it.price,
      quantity: it.quantity,
      line_total: it.line_total,
    })),
  );

  // Best-effort webhook to n8n. The order remains pending if this fails.
  await triggerStockWebhook({
    order_id: orderId,
    created_at: new Date().toISOString(),
    customer: {
      name: c.name.trim(),
      email: c.email.trim().toLowerCase(),
      phone: c.phone.trim(),
      alternate_phone: c.alternate_phone?.trim() ?? '',
      address: c.address.trim(),
      city: c.city.trim(),
    },
    items: resolvedItems.map((it) => ({
      product_id: it.product_id,
      variant_id: it.variant_id,
      title: it.title,
      variant_label: it.variant_label ?? '',
      color: it.color_snapshot ?? '',
      size: it.size_snapshot ?? '',
      price: it.price,
      quantity: it.quantity,
    })),
    subtotal,
    delivery_fee: deliveryFee,
    total,
  });

  revalidatePath(`/order/${orderId}`);
  return { ok: true, orderId, email: c.email.trim().toLowerCase() };
}

async function triggerStockWebhook(payload: unknown) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return; // not configured; order saved as pending regardless
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[n8n] stock webhook failed:', err);
  }
}
