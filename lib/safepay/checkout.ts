import { safepayCheckoutHost, type SafepayConfig } from '@/lib/safepay/config';

/**
 * Safepay Express Checkout session creation. SERVER-ONLY.
 *
 * Flow (official docs, Express Checkout):
 *   1. POST {host}/order/payments/v3/      -> tracker.token
 *   2. POST {host}/client/passport/v1/token -> authentication token ("tbt")
 *   3. Build the hosted checkout URL from tracker + tbt.
 *
 * Every request authenticates with the private secret key in the
 * X-SFPY-MERCHANT-SECRET header. No secret is returned to the caller.
 */

const REQUEST_TIMEOUT_MS = 15000;

interface SafepayEnvelope<T> {
  data?: T;
  status?: {
    errors?: { message?: string }[] | unknown[];
    message?: string;
  };
}

function errorMessage(body: unknown, fallback: string): string {
  const envelope = body as SafepayEnvelope<unknown> | null;
  const errors = envelope?.status?.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((e) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : ''))
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
    if (errors.length) return JSON.stringify(errors);
  }
  return envelope?.status?.message ?? fallback;
}

async function postJson<T>(
  url: string,
  secretKey: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-SFPY-MERCHANT-SECRET': secretKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(
      `Safepay request failed (${response.status}): ${errorMessage(parsed, 'unknown error')}`,
    );
  }

  return parsed as T;
}

/** Step 1: create the payment tracker and return its token. */
export async function createSafepayTracker(
  config: SafepayConfig,
  params: { amount: number; orderId: string },
): Promise<string> {
  const body = {
    merchant_api_key: config.publicKey,
    intent: 'CYBERSOURCE',
    mode: 'payment',
    entry_mode: 'raw',
    currency: 'PKR',
    // Amount in the lowest denomination (paisa for PKR).
    amount: params.amount,
    metadata: { order_id: params.orderId },
    include_fees: false,
  };

  const response = await postJson<
    SafepayEnvelope<{ tracker?: { token?: string } }>
  >(`${config.host}/order/payments/v3/`, config.secretKey, body);

  const token = response?.data?.tracker?.token;
  if (!token) {
    throw new Error(
      `Safepay did not return a tracker token: ${errorMessage(response, 'unknown error')}`,
    );
  }
  return token;
}

/** Step 2: create the short-lived authentication token used by the checkout page. */
export async function createSafepayPassportToken(
  config: SafepayConfig,
): Promise<string> {
  const response = await postJson<SafepayEnvelope<string>>(
    `${config.host}/client/passport/v1/token`,
    config.secretKey,
  );

  if (typeof response?.data !== 'string' || !response.data) {
    throw new Error(
      `Safepay did not return an authentication token: ${errorMessage(response, 'unknown error')}`,
    );
  }
  return response.data;
}

/**
 * Step 3: build the hosted checkout URL. Mirrors @sfpy/node-core
 * checkouts.payment.create: {environment, tbt, tracker, source, redirect, cancel}.
 */
export function buildSafepayCheckoutUrl(
  config: SafepayConfig,
  params: {
    tracker: string;
    tbt: string;
    redirectUrl: string;
    cancelUrl: string;
  },
): string {
  const query = new URLSearchParams({
    environment: config.environment,
    tbt: params.tbt,
    tracker: params.tracker,
    source: 'hosted',
    redirect_url: params.redirectUrl,
    cancel_url: params.cancelUrl,
  });
  return `${safepayCheckoutHost(config.environment)}?${query.toString()}`;
}

/** Runs the full session flow and returns the hosted checkout URL. */
export async function createSafepayCheckoutSession(
  config: SafepayConfig,
  params: {
    amount: number;
    orderId: string;
    redirectUrl: string;
    cancelUrl: string;
  },
): Promise<string> {
  const tracker = await createSafepayTracker(config, {
    amount: params.amount,
    orderId: params.orderId,
  });
  const tbt = await createSafepayPassportToken(config);

  return buildSafepayCheckoutUrl(config, {
    tracker,
    tbt,
    redirectUrl: params.redirectUrl,
    cancelUrl: params.cancelUrl,
  });
}
