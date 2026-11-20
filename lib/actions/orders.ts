'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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

  // Resolve products/variants from the DB, snapshot titles, and price server-side.
  const resolvedItems: {
    product_id: string;
    variant_id: string | null;
    title: string;
    variant_label: string | null;
    price: number;
    quantity: number;
    line_total: number;
  }[] = [];
  let subtotal = 0;

  for (const it of input.items) {
    const { data: product } = await admin
      .from('products')
      .select('id,title,slug,price,has_variants,stock,is_active')
      .eq('id', it.product_id)
      .maybeSingle();
    if (!product || !product.is_active) {
      return { ok: false, error: 'One of the items is no longer available.' };
    }

    let variantLabel: string | null = null;
    if (it.variant_id) {
      const { data: variant } = await admin
        .from('variants')
        .select('id,size,color,stock')
        .eq('id', it.variant_id)
        .eq('product_id', it.product_id)
        .maybeSingle();
      if (!variant) {
        return { ok: false, error: 'A selected variant is no longer available.' };
      }
      variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ');
    }

    const price = Number(product.price);
    const quantity = Math.max(1, Math.floor(it.quantity));
    const lineTotal = price * quantity;
    subtotal += lineTotal;

    resolvedItems.push({
      product_id: product.id,
      variant_id: it.variant_id,
      title: product.title,
      variant_label: variantLabel,
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
    const { data: cust } = await admin
      .from('customers')
      .select('id')
      .eq('auth_uid', user.id)
      .maybeSingle();
    customerId = cust?.id ?? null;
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
