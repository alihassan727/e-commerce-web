import { createAdminClient } from '@/lib/supabase/admin';
import type { ProductReview, ProductReviewWithCustomer } from '@/lib/types';

/**
 * Returns approved reviews for a product (public-facing).
 *
 * Uses the service-role client so the reviewer's display name can be joined:
 * the `customers` RLS policy only exposes a user's own row, so an anon read
 * would return null names for every other reviewer. Only `name` is selected —
 * no email or other customer data is exposed.
 */
export async function getProductReviews(productId: string): Promise<ProductReviewWithCustomer[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('product_reviews')
    .select(
      'id, product_id, customer_id, order_id, rating, review_text, status, created_at, updated_at, customer:customers(name)',
    )
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  return ((data ?? []) as unknown as (ProductReview & {
    customer: { name: string | null } | null;
  })[]).map((r) => ({
    ...r,
    customer_name: r.customer?.name ?? null,
    customer_email: null,
  }));
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

/**
 * Builds the aggregate rating from an already-fetched review list, so the
 * product page does not need a second query over the same rows.
 */
export function summarizeReviews(rows: { rating: number }[]): RatingSummary {
  if (rows.length === 0) return { average: 0, count: 0, distribution: {} };

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const row of rows) {
    distribution[row.rating] = (distribution[row.rating] ?? 0) + 1;
    total += row.rating;
  }
  return {
    average: Math.round((total / rows.length) * 10) / 10,
    count: rows.length,
    distribution,
  };
}

/** Returns all reviews a customer has submitted. */
export async function getMyReviews(customerId: string): Promise<(ProductReview & { product_title: string | null })[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('product_reviews')
    .select('*, product:products(title)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  return ((data ?? []) as unknown as (ProductReview & {
    product: { title: string } | null;
  })[]).map((r) => ({ ...r, product_title: r.product?.title ?? null }));
}

/**
 * Checks whether the signed-in customer is eligible to review a product.
 * Eligibility: at least one delivered order containing the product
 * (matched by customer_id or customer email for guest-placed orders).
 * Also returns whether they have already reviewed it.
 */
export async function getReviewEligibility(
  customerId: string,
  productId: string,
  customerEmail?: string | null,
): Promise<{
  eligible: boolean;
  alreadyReviewed: boolean;
  orderId: string | null;
  review: { id: string; rating: number; review_text: string | null } | null;
}> {
  const admin = createAdminClient();

  let email = customerEmail?.trim() ?? null;
  if (!email) {
    const { data: cust } = await admin
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .maybeSingle();
    email = cust?.email ?? null;
  }

  // Find delivered orders belonging to this customer (by customer_id or unlinked guest order email).
  let ordersQuery = admin
    .from('orders')
    .select('id')
    .eq('status', 'delivered');

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    ordersQuery = ordersQuery.or(`customer_id.eq.${customerId},and(customer_id.is.null,email.eq.${normalizedEmail})`);
  } else {
    ordersQuery = ordersQuery.eq('customer_id', customerId);
  }

  const { data: deliveredOrders } = await ordersQuery;
  const deliveredOrderIds = (deliveredOrders ?? []).map((o) => o.id as string);

  if (deliveredOrderIds.length === 0) {
    return { eligible: false, alreadyReviewed: false, orderId: null, review: null };
  }

  // Find an order_item in those delivered orders for this product.
  const { data: orderItems } = await admin
    .from('order_items')
    .select('order_id')
    .eq('product_id', productId)
    .in('order_id', deliveredOrderIds)
    .limit(1);

  const eligibleItem = (orderItems ?? [])[0] as { order_id: string } | undefined;

  if (!eligibleItem) {
    return { eligible: false, alreadyReviewed: false, orderId: null, review: null };
  }

  // Fetch the customer's existing review (if any) with the fields the edit
  // form needs, avoiding a second query on the product page.
  const { data: existing } = await admin
    .from('product_reviews')
    .select('id, rating, review_text')
    .eq('customer_id', customerId)
    .eq('product_id', productId)
    .maybeSingle();

  return {
    eligible: true,
    alreadyReviewed: Boolean(existing),
    orderId: eligibleItem.order_id,
    review: existing
      ? {
          id: existing.id as string,
          rating: existing.rating as number,
          review_text: (existing.review_text as string | null) ?? null,
        }
      : null,
  };
}

/**
 * Batch-checks which product IDs a customer has already reviewed.
 * Used on the order detail page to avoid N+1 queries.
 */
export async function getCustomerReviewedProductIds(
  customerId: string,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const admin = createAdminClient();
  const { data } = await admin
    .from('product_reviews')
    .select('product_id')
    .eq('customer_id', customerId)
    .in('product_id', productIds);
  return new Set((data ?? []).map((r) => r.product_id as string));
}

// Admin queries
export async function adminListReviews(filter?: {
  status?: string;
  product_id?: string;
}): Promise<ProductReviewWithCustomer[]> {
  const admin = createAdminClient();
  let q = admin
    .from('product_reviews')
    .select('*, customer:customers(name, email), product:products(title)')
    .order('created_at', { ascending: false });

  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  if (filter?.product_id) q = q.eq('product_id', filter.product_id);

  const { data } = await q;
  return ((data ?? []) as unknown as (ProductReview & {
    customer: { name: string | null; email: string } | null;
    product: { title: string } | null;
  })[]).map((r) => ({
    ...r,
    customer_name: r.customer?.name ?? null,
    customer_email: r.customer?.email ?? null,
    product_title: r.product?.title ?? null,
  }));
}
