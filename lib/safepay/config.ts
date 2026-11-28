import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Safepay configuration reader. SERVER-ONLY.
 *
 * Credentials live in public.payment_gateway_config (gateway = 'safepay',
 * credentials jsonb) and are written by the admin Configure screen. They are
 * read here with the service-role client and must never be returned to a
 * browser component, logged, or rendered.
 */

export type SafepayEnvironment = 'sandbox' | 'live';

export interface SafepayConfig {
  environment: SafepayEnvironment;
  /** API base used for tracker/passport calls. */
  host: string;
  /** Public API key (starts with "sec_"). Identifies the account. */
  publicKey: string;
  /** Private API secret key. Sent as X-SFPY-MERCHANT-SECRET. Never exposed. */
  secretKey: string;
}

// Documented hosts: sandbox for test transactions, api.getsafepay.com for live.
const API_HOSTS: Record<SafepayEnvironment, string> = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  live: 'https://api.getsafepay.com',
};

// Hosted checkout page hosts (see @sfpy/node-core hostUrls).
const CHECKOUT_HOSTS: Record<SafepayEnvironment, string> = {
  sandbox: 'https://sandbox.api.getsafepay.com/embedded/',
  live: 'https://getsafepay.com/embedded/',
};

/**
 * Returns the saved Safepay credentials, or null when the gateway has not been
 * configured (missing row, missing environment, or missing keys). Callers treat
 * null as "card payments unavailable" rather than inventing defaults.
 */
export async function getSafepayConfig(): Promise<SafepayConfig | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payment_gateway_config')
    .select('credentials')
    .eq('gateway', 'safepay')
    .maybeSingle();

  if (error || !data) return null;

  const credentials = (data.credentials ?? {}) as Record<string, string>;
  const environment: SafepayEnvironment | null =
    credentials.environment === 'sandbox'
      ? 'sandbox'
      : credentials.environment === 'live'
        ? 'live'
        : null;
  const publicKey = String(credentials.public_key ?? '').trim();
  const secretKey = String(credentials.secret_key ?? '').trim();

  if (!environment || !publicKey || !secretKey) return null;

  return {
    environment,
    host: API_HOSTS[environment],
    publicKey,
    secretKey,
  };
}

/** Base URL of the hosted checkout page for the configured environment. */
export function safepayCheckoutHost(environment: SafepayEnvironment): string {
  return CHECKOUT_HOSTS[environment];
}

/**
 * Webhook shared secret, used only to verify X-SFPY-SIGNATURE. SERVER-ONLY.
 * Kept out of SafepayConfig so it is never carried into checkout code paths.
 */
export async function getSafepayWebhookSecret(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payment_gateway_config')
    .select('credentials')
    .eq('gateway', 'safepay')
    .maybeSingle();

  if (error || !data) return null;

  const credentials = (data.credentials ?? {}) as Record<string, string>;
  const secret = String(credentials.webhook_secret ?? '').trim();
  return secret || null;
}
