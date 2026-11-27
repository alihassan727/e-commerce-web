import Link from 'next/link';
import { adminListPaymentGateways } from '@/lib/queries/admin';

const GATEWAY_META: Record<string, { label: string; description: string }> = {
  cod: {
    label: 'Cash on Delivery',
    description: 'Customers pay when their order arrives. No integration required.',
  },
  safepay: {
    label: 'Safepay',
    description: 'Pakistani payment gateway supporting cards and wallets. Not connected.',
  },
  payfast: {
    label: 'PayFast',
    description: 'South African payment gateway. Not connected.',
  },
};

export default async function AdminPaymentsPage() {
  const gateways = await adminListPaymentGateways();

  return (
    <div>
      <h1 className="font-serif text-3xl mb-2 text-ink dark:text-dark-ink">Payment settings</h1>
      <p className="text-sm text-muted dark:text-dark-muted mb-8">
        Cash on Delivery is the only active payment method. Other gateways can be configured here for future use but will not be shown to customers until fully integrated.
      </p>

      <div className="flex flex-col gap-4">
        {/* COD — always active, no configuration needed */}
        <div className="border border-line dark:border-dark-line p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="font-medium text-ink dark:text-dark-ink">Cash on Delivery</p>
                <span className="border theme-border theme-text text-xs px-2 py-0.5">Active</span>
              </div>
              <p className="text-sm text-muted dark:text-dark-muted">
                {GATEWAY_META.cod.description}
              </p>
            </div>
            <span className="text-sm text-muted dark:text-dark-muted whitespace-nowrap">No configuration required</span>
          </div>
        </div>

        {/* Online gateways */}
        {gateways.map((gw) => {
          const meta = GATEWAY_META[gw.gateway] ?? { label: gw.gateway, description: '' };
          const configured = gw.has_credentials;
          return (
            <div key={gw.gateway} className="border border-line dark:border-dark-line p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-medium text-ink dark:text-dark-ink">{meta.label}</p>
                    <span className="border border-line dark:border-dark-line text-muted dark:text-dark-muted text-xs px-2 py-0.5">
                      {configured ? 'Configured — not active' : 'Not connected'}
                    </span>
                  </div>
                  <p className="text-sm text-muted dark:text-dark-muted">{meta.description}</p>
                  {configured && (
                    <p className="text-xs text-muted dark:text-dark-muted mt-1">
                      Credentials saved. Last updated {new Date(gw.updated_at).toLocaleDateString()}.
                      Gateway will not be shown to customers until fully integrated.
                    </p>
                  )}
                </div>
                <Link
                  href={`/admin/payments/${gw.gateway}`}
                  className="btn btn-outline text-sm whitespace-nowrap"
                >
                  {configured ? 'Edit configuration' : 'Configure'}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 border border-line dark:border-dark-line p-4 max-w-xl">
        <p className="text-sm font-medium text-ink dark:text-dark-ink mb-1">About payment gateway activation</p>
        <p className="text-sm text-muted dark:text-dark-muted">
          Saving credentials here does NOT activate online payments. Activating a gateway requires additional code integration. Contact your developer when you are ready to go live with online payments.
        </p>
      </div>
    </div>
  );
}
