'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin';
import { ensureCustomerForUser } from '@/lib/customer';
import type { Customer, ReviewStatus } from '@/lib/types';

export type ReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(input: {
  product_id: string;
  rating: number;
  review_text?: string;
}): Promise<ReviewResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in to submit a review.' };

  if (input.rating < 1 || input.rating > 5) {
    return { ok: false, error: 'Rating must be between 1 and 5.' };
  }

  const admin = createAdminClient();

  // Recreate or re-link the customer row if database cleanup removed it.
  let customer: Customer;
  try {
    customer = await ensureCustomerForUser(user);
  } catch (err) {
    console.error('[reviews] customer lookup failed:', err);
    return { ok: false, error: 'Could not load your account. Please try again.' };
  }

  // Server-side eligibility check: must have a delivered order with this product
  // (matched by customer_id or unlinked guest order email).
  let ordersQuery = admin
    .from('orders')
    .select('id')
    .eq('status', 'delivered');
  const normalizedEmail = customer.email?.trim().toLowerCase();
  if (normalizedEmail) {
    ordersQuery = ordersQuery.or(`customer_id.eq.${customer.id},and(customer_id.is.null,email.eq.${normalizedEmail})`);
  } else {
    ordersQuery = ordersQuery.eq('customer_id', customer.id);
  }
  const { data: deliveredOrders } = await ordersQuery;
  const deliveredOrderIds = (deliveredOrders ?? []).map((o) => o.id as string);

  let eligibleItem: { order_id: string } | undefined;
  if (deliveredOrderIds.length > 0) {
    const { data: orderItems } = await admin
      .from('order_items')
      .select('order_id')
      .eq('product_id', input.product_id)
      .in('order_id', deliveredOrderIds)
      .limit(1);
    eligibleItem = (orderItems ?? [])[0] as { order_id: string } | undefined;
  }

  if (!eligibleItem) {
    return {
      ok: false,
      error:
        'You can only review products from orders that have been delivered.',
    };
  }

  // Prevent duplicate reviews.
  const { data: existing } = await admin
    .from('product_reviews')
    .select('id')
    .eq('customer_id', customer.id)
    .eq('product_id', input.product_id)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: 'You have already reviewed this product.' };
  }

  const { error } = await admin.from('product_reviews').insert({
    product_id:   input.product_id,
    customer_id:  customer.id,
    order_id:     eligibleItem.order_id,
    rating:       input.rating,
    review_text:  input.review_text?.trim() || null,
    status:       'pending',
  });

  if (error) return { ok: false, error: error.message };

  const { data: prod } = await admin
    .from('products')
    .select('slug')
    .eq('id', input.product_id)
    .maybeSingle();
  if (prod?.slug) revalidatePath(`/product/${prod.slug}`);
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/account/orders');
  revalidatePath('/account/orders/[id]', 'page');
  revalidatePath('/admin/reviews');
  return { ok: true };
}

export async function editReview(input: {
  review_id: string;
  rating: number;
  review_text?: string;
}): Promise<ReviewResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (input.rating < 1 || input.rating > 5) {
    return { ok: false, error: 'Rating must be between 1 and 5.' };
  }

  const admin = createAdminClient();
  let customer: Customer;
  try {
    customer = await ensureCustomerForUser(user);
  } catch (err) {
    console.error('[reviews] customer lookup failed:', err);
    return { ok: false, error: 'Could not load your account. Please try again.' };
  }

  // Only allow editing own review.
  const { data: review } = await admin
    .from('product_reviews')
    .select('id, product_id')
    .eq('id', input.review_id)
    .eq('customer_id', customer.id)
    .maybeSingle();
  if (!review) return { ok: false, error: 'Review not found.' };

  const { error } = await admin
    .from('product_reviews')
    .update({
      rating:      input.rating,
      review_text: input.review_text?.trim() || null,
      status:      'pending', // Reset to pending on edit so admin can re-approve.
    })
    .eq('id', input.review_id);

  if (error) return { ok: false, error: error.message };

  const { data: prod } = await admin
    .from('products')
    .select('slug')
    .eq('id', review.product_id)
    .maybeSingle();
  if (prod?.slug) revalidatePath(`/product/${prod.slug}`);
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/admin/reviews');
  return { ok: true };
}

// Admin actions
export async function adminSetReviewStatus(
  id: string,
  status: ReviewStatus,
): Promise<ReviewResult> {
  await requireAdmin();
  const valid: ReviewStatus[] = ['pending', 'approved', 'hidden'];
  if (!valid.includes(status)) return { ok: false, error: 'Invalid status.' };

  const admin = createAdminClient();
  const { data: review } = await admin
    .from('product_reviews')
    .select('product_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await admin
    .from('product_reviews')
    .update({ status })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  if (review?.product_id) {
    const { data: prod } = await admin
      .from('products')
      .select('slug')
      .eq('id', review.product_id)
      .maybeSingle();
    if (prod?.slug) revalidatePath(`/product/${prod.slug}`);
  }
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/admin/reviews');
  return { ok: true };
}

export async function adminDeleteReview(id: string): Promise<ReviewResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: review } = await admin
    .from('product_reviews')
    .select('product_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await admin.from('product_reviews').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  if (review?.product_id) {
    const { data: prod } = await admin
      .from('products')
      .select('slug')
      .eq('id', review.product_id)
      .maybeSingle();
    if (prod?.slug) revalidatePath(`/product/${prod.slug}`);
  }
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/admin/reviews');
  return { ok: true };
}
