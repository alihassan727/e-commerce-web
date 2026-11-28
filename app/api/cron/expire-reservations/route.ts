import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Vercel Cron endpoint for expiring stale Safepay stock reservations.
 *
 * Calls the existing `expire_stale_reservations` RPC, which releases only
 * expired ACTIVE holds and marks their pending orders as expired. It never
 * touches valid (unexpired) or finalized (paid) reservations, so paid and
 * valid orders keep their stock.
 *
 * Protected by CRON_SECRET: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * If CRON_SECRET is unset, every request is rejected so the endpoint cannot
 * be used to release stock anonymously.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'cron_not_configured' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('expire_stale_reservations', {
      p_limit: 200,
    });

    if (error) {
      console.error('[cron] expire_stale_reservations failed:', error.message);
      return NextResponse.json(
        { ok: false, error: 'rpc_failed' },
        { status: 500 },
      );
    }

    const expiredCount = (data as { expired_count: number }[] | null)?.[0]
      ?.expired_count ?? 0;

    return NextResponse.json({ ok: true, expired: expiredCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[cron] expire reservations failed:', message);
    return NextResponse.json(
      { ok: false, error: 'processing_failed' },
      { status: 500 },
    );
  }
}