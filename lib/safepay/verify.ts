import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SafepayConfig, SafepayEnvironment } from '@/lib/safepay/config';

/**
 * Safepay webhook + reporter verification helpers. SERVER-ONLY.
 *
 * Signature: Safepay documents an HMAC-SHA512 of the raw request body, keyed
 * with the dashboard "shared secret" (webhook secret), sent in the
 * X-SFPY-SIGNATURE header as a lowercase hex digest. The raw bytes are used —
 * never a re-serialised parse of the JSON.
 */
export function verifySafepaySignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const provided = signatureHeader.trim().replace(/^sha512=/i, '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;

  const expected = createHmac('sha512', webhookSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const providedBytes = Buffer.from(provided, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}

export interface SafepayTrackerSnapshot {
  tracker: string;
  environment: SafepayEnvironment | null;
  state: string;
  /** metadata.order_id stored on the tracker when the session was created. */
  orderId: string | null;
  /** Quote amount in the lowest denomination (paisa for PKR). */
  amount: number | null;
  currency: string | null;
  /**
   * Documented payment charge token (`ch_…`). A tracker identifies the payment
   * session; the charge is the captured transaction. Null until captured.
   */
  chargeToken: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function metadataValue(metadata: unknown, key: string): string | null {
  const record = asRecord(metadata);
  if (!record) return null;
  const raw = record[key];
  if (typeof raw === 'string') return raw;
  const nested = asRecord(raw);
  const value = nested?.value;
  return typeof value === 'string' ? value : null;
}

/**
 * Fetches the tracker from Safepay's server-side reporter API and normalises
 * the fields used for verification. This is the authoritative payment state —
 * a browser redirect is never trusted.
 */
export async function fetchSafepayTracker(
  config: SafepayConfig,
  tracker: string,
): Promise<SafepayTrackerSnapshot> {
  const response = await fetch(
    `${config.host}/reporter/api/v1/payments/${encodeURIComponent(tracker)}`,
    {
      method: 'GET',
      headers: { 'X-SFPY-MERCHANT-SECRET': config.secretKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    },
  );

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`Safepay reporter request failed (${response.status})`);
  }

  const envelope = asRecord(parsed);
  const data = asRecord(envelope?.data) ?? envelope;
  // The reporter returns the tracker at data.tracker in the payment-session
  // shape and directly under data in the fetch-tracker shape.
  const trackerObject = asRecord(data?.tracker) ?? data;
  if (!trackerObject) {
    throw new Error('Safepay reporter returned no tracker data');
  }

  const totals = asRecord(trackerObject.purchase_totals);
  const quote = asRecord(totals?.quote_amount);
  const charge = asRecord(trackerObject.charge);

  const rawEnvironment = trackerObject.environment;
  const environment: SafepayEnvironment | null =
    rawEnvironment === 'sandbox'
      ? 'sandbox'
      : rawEnvironment === 'production' || rawEnvironment === 'live'
        ? 'live'
        : null;

  const rawAmount = quote?.amount;
  const amount =
    rawAmount === undefined || rawAmount === null || rawAmount === ''
      ? null
      : Number(rawAmount);

  return {
    tracker: typeof trackerObject.token === 'string' ? trackerObject.token : '',
    environment,
    state: typeof trackerObject.state === 'string' ? trackerObject.state : '',
    orderId: metadataValue(trackerObject.metadata, 'order_id'),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: typeof quote?.currency === 'string' ? quote.currency : null,
    chargeToken: typeof charge?.token === 'string' ? charge.token : null,
  };
}
