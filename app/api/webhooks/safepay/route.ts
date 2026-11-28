import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/search';
import { getSafepayConfig, getSafepayWebhookSecret } from '@/lib/safepay/config';
import {
  fetchSafepayTracker,
  verifySafepaySignature,
} from '@/lib/safepay/verify';

/**
 * Safepay webhook endpoint.
 *
 * Trust chain (in order):
 *   1. HMAC-SHA512 of the raw body with the saved webhook secret.
 *   2. Deduplicate/lease the event through claim_payment_webhook.
 *   3. Read the tracker token from the signed event, then fetch the tracker
 *      from Safepay's authenticated reporter API. Resolve the order id from
 *      the reporter's verified tracker metadata when the webhook metadata is
 *      missing/empty (payment.failed deliveries can carry empty metadata).
 *   4. Load the order using only that verified id.
 *   5. Compare tracker token, environment, order id, amount and currency
 *      against the order.
 *   6. Only then finalize (success) or fail (terminal failure) through the
 *      verified-payment RPCs.
 *
 * Browser redirects and query parameters are never used as payment proof.
 * Orders are never matched by customer email.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GATEWAY = 'safepay';

/** Tracker states that end the payment session without a capture. */
const TERMINAL_FAILURE_STATES = new Set([
  'TRACKER_CANCELLED',
  'TRACKER_EXPIRED',
  'TRACKER_REVERSED',
  'TRACKER_VOIDED',
]);

interface SafepayWebhookPayload {
  token?: string;
  version?: string;
  type?: string;
  data?: {
    tracker?: string;
    state?: string;
    amount?: number | string;
    currency?: string;
    metadata?: Record<string, unknown>;
  };
}

interface OrderPaymentRow {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total: number;
  payment_currency: string | null;
}

interface ClaimRow {
  event_id: string;
  claimed: boolean;
  processing_status: string;
  lock_token: string | null;
}

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

/** Webhook metadata arrives as plain values; the reporter nests them as {value}. */
function metadataOrderId(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const raw = metadata.order_id;
  if (typeof raw === 'string') return raw.trim() || null;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const value = (raw as { value?: unknown }).value;
    return typeof value === 'string' ? value.trim() || null : null;
  }
  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const webhookSecret = await getSafepayWebhookSecret();
  if (!webhookSecret) {
    // Never log the secret or the header value.
    console.error('[safepay-webhook] webhook_secret is not configured');
    return reply(500, { ok: false, error: 'not_configured' });
  }

  if (
    !verifySafepaySignature(
      rawBody,
      request.headers.get('x-sfpy-signature'),
      webhookSecret,
    )
  ) {
    return reply(401, { ok: false, error: 'invalid_signature' });
  }

  let payload: SafepayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SafepayWebhookPayload;
  } catch {
    return reply(400, { ok: false, error: 'invalid_json' });
  }

  const headerEventId = request.headers.get('x-sfpy-event-id');
  const headerEventType = request.headers.get('x-sfpy-event-type');
  const eventId = (headerEventId ?? payload.token ?? '').trim();
  const eventType = (headerEventType ?? payload.type ?? '').trim();

  if (!eventId) return reply(400, { ok: false, error: 'missing_event_id' });

  // Routing headers must agree with the signed body when both are present.
  if (headerEventId && payload.token && headerEventId !== payload.token) {
    return reply(400, { ok: false, error: 'event_id_mismatch' });
  }
  if (headerEventType && payload.type && headerEventType !== payload.type) {
    return reply(400, { ok: false, error: 'event_type_mismatch' });
  }

  if (eventType !== 'payment.succeeded' && eventType !== 'payment.failed') {
    return reply(200, { ok: true, result: 'ignored_event_type' });
  }

  const data = payload.data ?? {};
  const tracker = typeof data.tracker === 'string' ? data.tracker.trim() : '';
  if (!tracker) return reply(400, { ok: false, error: 'missing_tracker' });

  const admin = createAdminClient();

  const { data: claimRows, error: claimError } = await admin.rpc(
    'claim_payment_webhook',
    {
      p_gateway: GATEWAY,
      p_provider_event_id: eventId,
      p_event_type: eventType,
      p_payload: payload,
      p_lease_seconds: 300,
    },
  );

  const claim = (claimRows as ClaimRow[] | null)?.[0];
  if (claimError || !claim) {
    console.error(
      '[safepay-webhook] claim failed:',
      claimError?.message ?? 'no row returned',
    );
    return reply(500, { ok: false, error: 'claim_failed' });
  }
  if (!claim.claimed || !claim.lock_token) {
    // Duplicate delivery, already processed event, or an active lease.
    return reply(200, {
      ok: true,
      result: 'already_claimed',
      status: claim.processing_status,
    });
  }

  const eventRowId = claim.event_id;
  const lockToken = claim.lock_token;

  async function finish(
    status: 'processed' | 'ignored' | 'failed',
    message?: string,
  ) {
    const { data: marked, error } = await admin.rpc(
      'mark_payment_webhook_processed',
      {
        p_event_id: eventRowId,
        p_lock_token: lockToken,
        p_status: status,
        p_error: message ?? null,
      },
    );
    if (error || marked !== true) {
      console.error(
        '[safepay-webhook] could not mark event',
        eventRowId,
        error?.message ?? 'lock lost',
      );
    }
  }

  try {
    // Config must be available before we can talk to Safepay's reporter API.
    const config = await getSafepayConfig();
    if (!config) {
      await finish('failed', 'Safepay is not configured');
      return reply(500, { ok: false, error: 'not_configured' });
    }

    // Authoritative tracker state from Safepay's server-side reporter API.
    const snapshot = await fetchSafepayTracker(config, tracker);

    // Resolve the order id. Prefer the signed webhook metadata when present,
    // but fall back to the reporter's verified tracker metadata for deliveries
    // (e.g. payment.failed) whose data.metadata is empty. Never match by
    // customer email and never trust browser query parameters.
    const webhookOrderId = metadataOrderId(data.metadata);
    const reporterOrderId = snapshot.orderId;

    if (
      webhookOrderId &&
      reporterOrderId &&
      webhookOrderId !== reporterOrderId
    ) {
      await finish(
        'failed',
        'Webhook and reporter order ids disagree',
      );
      return reply(400, { ok: false, error: 'verification_failed' });
    }

    const resolvedOrderId = (webhookOrderId ?? reporterOrderId ?? '').trim();

    if (!resolvedOrderId || !isUuid(resolvedOrderId)) {
      await finish('ignored', 'No verifiable order_id reference');
      return reply(200, { ok: true, result: 'no_order_reference' });
    }

    const { data: orderRowData, error: orderError } = await admin
      .from('orders')
      .select('id,status,payment_method,payment_status,total,payment_currency')
      .eq('id', resolvedOrderId)
      .maybeSingle();

    if (orderError) {
      await finish('failed', orderError.message);
      return reply(500, { ok: false, error: 'order_lookup_failed' });
    }
    if (!orderRowData) {
      await finish('ignored', 'Order not found');
      return reply(200, { ok: true, result: 'order_not_found' });
    }

    const order = orderRowData as OrderPaymentRow;
    if (order.payment_method !== GATEWAY) {
      await finish('ignored', `Order payment_method is ${order.payment_method}`);
      return reply(200, { ok: true, result: 'not_safepay_order' });
    }

    const expectedAmount = Math.round(Number(order.total) * 100);
    const expectedCurrency = (order.payment_currency ?? 'PKR').toUpperCase();

    const mismatch =
      snapshot.tracker !== tracker
        ? 'Tracker token does not match the reported payment session'
        : snapshot.environment !== config.environment
          ? 'Payment environment does not match the configured gateway'
          : snapshot.orderId !== null && snapshot.orderId !== resolvedOrderId
            ? 'Payment metadata does not reference this order'
            : !snapshot.currency || snapshot.currency.toUpperCase() !== expectedCurrency
              ? 'Payment currency does not match the order'
              : snapshot.amount === null || snapshot.amount !== expectedAmount
                ? 'Payment amount does not match the order total'
                : null;

    if (mismatch) {
      console.error('[safepay-webhook] verification mismatch:', mismatch);
      await finish('failed', mismatch);
      return reply(400, { ok: false, error: 'verification_failed' });
    }

    // The signed body's own amount/currency must agree with the order too,
    // when present. Empty metadata (payment.failed) is allowed.
    const bodyAmount =
      data.amount === undefined || data.amount === null
        ? null
        : Number(data.amount);
    const bodyCurrency =
      typeof data.currency === 'string' ? data.currency.toUpperCase() : null;
    if (bodyAmount !== null && Number.isFinite(bodyAmount) && bodyAmount !== expectedAmount) {
      await finish('failed', 'Webhook amount does not match the order total');
      return reply(400, { ok: false, error: 'verification_failed' });
    }
    if (bodyCurrency !== null && bodyCurrency !== expectedCurrency) {
      await finish('failed', 'Webhook currency does not match the order');
      return reply(400, { ok: false, error: 'verification_failed' });
    }

    // Already-paid orders: idempotent handling inside the RPCs. A late
    // successful payment for an already-paid order is rejected as a
    // different-provider-transaction case unless it is the same charge token.
    if (order.payment_status === 'paid') {
      // Still run the reporter-verified finalize path; the RPC is idempotent
      // on the charge token and rejects conflicting transactions.
      if (eventType !== 'payment.succeeded' || snapshot.state !== 'TRACKER_ENDED') {
        await finish('ignored', 'Order already paid; non-success event ignored');
        return reply(200, { ok: true, result: 'already_paid' });
      }
    }

    const captureVerified =
      eventType === 'payment.succeeded' || snapshot.state === 'TRACKER_ENDED';

    if (captureVerified) {
      if (snapshot.state !== 'TRACKER_ENDED') {
        await finish(
          'failed',
          `Tracker state is ${snapshot.state}, not TRACKER_ENDED`,
        );
        return reply(409, { ok: false, error: 'tracker_not_ended' });
      }

      if (!snapshot.chargeToken) {
        await finish('failed', 'Tracker has no charge token for a captured payment');
        return reply(500, { ok: false, error: 'missing_charge_token' });
      }

      const { data: finalizedRows, error: finalizeError } = await admin.rpc(
        'finalize_paid_order',
        {
          p_order_id: order.id,
          p_gateway: GATEWAY,
          p_environment: config.environment,
          p_provider_transaction_id: snapshot.chargeToken,
          p_amount: Number(order.total),
          p_currency: expectedCurrency,
          p_payload: { webhook: payload, verified_tracker: snapshot },
        },
      );

      const finalized = (
        finalizedRows as
          | {
              ok: boolean;
              payment_status: string | null;
              order_status: string | null;
              message: string;
            }[]
          | null
      )?.[0];

      if (finalizeError || !finalized) {
        await finish(
          'failed',
          finalizeError?.message ?? 'finalize_paid_order returned no row',
        );
        return reply(500, { ok: false, error: 'finalize_failed' });
      }
      if (!finalized.ok) {
        await finish('failed', finalized.message);
        return reply(409, {
          ok: false,
          error: 'not_finalized',
          message: finalized.message,
        });
      }

      await finish('processed');
      return reply(200, {
        ok: true,
        result: 'paid',
        order_status: finalized.order_status,
      });
    }

    if (TERMINAL_FAILURE_STATES.has(snapshot.state)) {
      const outcome = snapshot.state === 'TRACKER_CANCELLED' ? 'cancelled' : 'failed';

      const { data: failedRows, error: failError } = await admin.rpc(
        'fail_order_payment',
        {
          p_order_id: order.id,
          p_gateway: GATEWAY,
          p_environment: config.environment,
          // No charge exists for a failed session; the tracker token is the
          // documented identifier of the payment session being closed.
          p_provider_transaction_id: tracker,
          p_outcome: outcome,
          p_payload: { webhook: payload, verified_tracker: snapshot },
        },
      );

      const failed = (
        failedRows as { ok: boolean; payment_status: string | null; message: string }[] | null
      )?.[0];

      if (failError || !failed) {
        await finish('failed', failError?.message ?? 'fail_order_payment returned no row');
        return reply(500, { ok: false, error: 'fail_failed' });
      }
      if (!failed.ok) {
        await finish('failed', failed.message);
        return reply(409, { ok: false, error: 'not_failed', message: failed.message });
      }

      await finish('processed');
      return reply(200, { ok: true, result: outcome });
    }

    // The attempt failed but the session is still open: Safepay lets the
    // shopper retry inside the same tracker, so the stock hold is kept.
    await finish(
      'ignored',
      `Tracker state ${snapshot.state} is not terminal; a retry is still possible`,
    );
    return reply(200, { ok: true, result: 'retryable_failure' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[safepay-webhook] processing failed:', message);
    await finish('failed', message);
    return reply(500, { ok: false, error: 'processing_failed' });
  }
}