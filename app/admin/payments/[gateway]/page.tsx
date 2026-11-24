import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminGetPaymentGateway } from '@/lib/queries/admin';
import GatewayConfigForm from './client';

const GATEWAY_META: Record<string, {
  label: string;
  description: string;
  fields: { key: string; label: string; type: 'text' | 'select' | 'secret'; options?: string[] }[];
}> = {
  safepay: {
    label: 'Safepay',
    description: 'Configure your Safepay merchant credentials. Use Sandbox for testing.',
    fields: [
      { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'live'] },
      { key: 'public_key', label: 'Public API Key', type: 'text' },
      { key: 'secret_key', label: 'Secret API Key', type: 'secret' },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'secret' },
    ],
  },
  payfast: {
    label: 'PayFast',
    description: 'Configure your PayFast merchant credentials.',
    fields: [
      { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'live'] },
      { key: 'merchant_id', label: 'Merchant ID', type: 'text' },
      { key: 'secured_key', label: 'Secured Key', type: 'secret' },
    ],
  },
};

export default async function GatewayPage({ params }: { params: { gateway: string } }) {
  const meta = GATEWAY_META[params.gateway];
  if (!meta) notFound();

  const row = await adminGetPaymentGateway(params.gateway);
  if (!row) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">{meta.label} configuration</h1>
        <Link href="/admin/payments" className="text-sm theme-text">Back to payments</Link>
      </div>

      <div className="border border-line dark:border-dark-line p-4 mb-6 max-w-xl">
        <p className="text-sm font-medium text-ink dark:text-dark-ink mb-1">Not connected</p>
        <p className="text-sm text-muted dark:text-dark-muted">
          {meta.description} Saving these credentials does NOT activate {meta.label} at checkout. Online payments remain disabled.
        </p>
      </div>

      <GatewayConfigForm
        gateway={row.gateway}
        label={meta.label}
        fields={meta.fields}
        existingCredentials={row.credentials}
      />
    </div>
  );
}
