'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSafepayConfig } from '@/lib/safepay/config';
import { createSafepayCheckoutSession } from '@/lib/safepay/checkout';
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
  /** "cod" (default) keeps the existing COD flow; "safepay" is paid online. */
  payment_method?: 'cod' | 'safepay';
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
  /** COD: the order is placed and the customer can be sent to its page. */
  | { ok: true; orderId: string; email: string }
  /** Safepay: the order and stock hold exist; redirect to the hosted checkout. */
  | { ok: true; orderId: string; redirectUrl: string }
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
 * Creates an order (status pending).
 *
 * COD (default, unchanged): prices/totals are recomputed from the database,
 * then the n8n stock-check webhook fires. Stock is NOT deducted here: n8n
 * checks stock and sets the order to confirmed or out_of_stock. The webhook is
 * best-effort; the order stays pending if n8n is unreachable.
 *
 * Safepay: the order is created with payment_method 'safepay' and
 * payment_status 'unpaid', a stock hold is taken with reserve_order_stock, and
 * a hosted checkout session is created. n8n is NOT called. Nothing is marked
 * paid here — confirmation only happens after a verified webhook.
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
  const paymentMethod: 'cod' | 'safepay' =
    input.payment_method === 'safepay' ? 'safepay' : 'cod';

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
      // Online orders must declare a real payment state: the database rejects
      // the COD default ('not_required') for non-COD rows. payment_gateway,
      // payment_amount and paid_at stay NULL until a verified payment.
      ...(paymentMethod === 'safepay'
        ? { payment_method: 'safepay', payment_status: 'unpaid' }
        : {}),
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

  if (paymentMethod === 'safepay') {
    // The reservation RPC owns online stock holds; n8n must not run for these
    // orders, so the COD webhook is skipped entirely.
    revalidatePath(`/order/${orderId}`);
    return startSafepayCheckout(orderId);
  }

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

/**
 * Reserved stock TTL passed to reserve_order_stock (seconds). The RPC clamps
 * this to 60..3600; 900 matches the intended 15-minute checkout window.
 */
const SAFEPAY_RESERVATION_TTL_SECONDS = 900;

/**
 * Takes the stock hold for an online order and creates the Safepay hosted
 * checkout session. The charge amount is always the order total read back from
 * the database, never a client value. On any failure after the hold the
 * reservation is released, so stock cannot leak.
 */
async function startSafepayCheckout(
  orderId: string,
): Promise<CreateOrderResult> {
  const admin = createAdminClient();

  const { data: reservationData, error: reserveError } = await admin.rpc(
    'reserve_order_stock',
    { p_order_id: orderId, p_ttl_seconds: SAFEPAY_RESERVATION_TTL_SECONDS },
  );

  // RETURNS TABLE -> array; the RPC reports failures as a status row.
  const reservation = (reservationData as
    | { reservation_id: string | null; status: string; message: string }[]
    | null)?.[0];

  const reserved =
    !reserveError &&
    (reservation?.status === 'reserved' || reservation?.status === 'active');

  if (!reserved) {
    if (reserveError) {
      console.error('[safepay] stock reservation failed:', reserveError.message);
    }
    return {
      ok: false,
      error:
        'Sorry, one of the items in your order is not available in the requested quantity. Please adjust your cart or choose cash on delivery.',
    };
  }

  const { data: orderRow } = await admin
    .from('orders')
    .select('total')
    .eq('id', orderId)
    .maybeSingle();
  const total = Number(orderRow?.total ?? NaN);

  if (!Number.isFinite(total) || total <= 0) {
    console.error('[safepay] order total unavailable for', orderId);
    await releaseSafepayReservation(orderId, 'invalid_total');
    return {
      ok: false,
      error: 'We could not start the card payment. Please try again.',
    };
  }

  const config = await getSafepayConfig();
  if (!config) {
    await releaseSafepayReservation(orderId, 'gateway_not_configured');
    return {
      ok: false,
      error:
        'Card payment is not available right now. Please choose cash on delivery.',
    };
  }

  const origin = siteOrigin();

  try {
    const checkoutUrl = await createSafepayCheckoutSession(config, {
      // Safepay expects the lowest denomination: PKR paisa.
      amount: Math.round(total * 100),
      orderId,
      redirectUrl: `${origin}/order/${orderId}?payment=return`,
      cancelUrl: `${origin}/order/${orderId}?payment=cancelled`,
    });
    return { ok: true, orderId, redirectUrl: checkoutUrl };
  } catch (err) {
    // Never log credentials; only the provider's error text.
    console.error(
      '[safepay] checkout session failed:',
      err instanceof Error ? err.message : 'unknown error',
    );
    await releaseSafepayReservation(orderId, 'session_failed');
    return {
      ok: false,
      error:
        'We could not start the card payment. Please try again or choose cash on delivery.',
    };
  }
}

/** Releases an online stock hold. Safe to call more than once. */
async function releaseSafepayReservation(orderId: string, reason: string) {
  try {
    const admin = createAdminClient();
    await admin.rpc('release_order_reservation', {
      p_order_id: orderId,
      p_reason: reason,
    });
  } catch (err) {
    console.error(
      '[safepay] reservation release failed:',
      err instanceof Error ? err.message : 'unknown error',
    );
  }
}

/** Public origin of the storefront, used for the Safepay return/cancel URLs. */
function siteOrigin(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const forwardedProto = h.get('x-forwarded-proto');
    const proto =
      forwardedProto ??
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
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
