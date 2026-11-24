'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminAddTrackingEvent } from '@/lib/actions/account';
import type { OrderTrackingEvent } from '@/lib/types';

const TRACKING_STATUSES = [
  { value: 'confirmed', label: 'Order Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

export default function AdminTrackingForm({
  orderId,
  events,
}: {
  orderId: string;
  events: OrderTrackingEvent[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('dispatched');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onAdd() {
    setErr(null);
    setSaving(true);
    const res = await adminAddTrackingEvent(orderId, status, description);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setDescription('');
    router.refresh();
  }

  return (
    <div className="border-t border-line dark:border-dark-line pt-6 mt-6">
      <h2 className="font-medium mb-4 text-ink dark:text-dark-ink">Order tracking</h2>
      <p className="text-sm text-muted dark:text-dark-muted mb-4">
        Add a tracking update. Each update is saved permanently and shown to the customer.
      </p>
      <div className="flex flex-col gap-3 max-w-md mb-6">
        <div className="field">
          <label htmlFor="track-status">Delivery stage</label>
          <select id="track-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {TRACKING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="track-desc">Message to customer (optional)</label>
          <input id="track-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder='e.g. "Your parcel is on its way from our Lahore warehouse."' />
        </div>
        {err && <p className="text-sm theme-text">{err}</p>}
        <button className="btn btn-primary" onClick={onAdd} disabled={saving}>{saving ? 'Adding' : 'Add tracking update'}</button>
      </div>

      {/* History */}
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-ink dark:text-dark-ink">Tracking history</h3>
          <div className="border border-line dark:border-dark-line">
            {events.map((e) => (
              <div key={e.id} className="px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm">
                <p className="font-medium text-ink dark:text-dark-ink">{e.status}</p>
                {e.description && <p className="text-muted dark:text-dark-muted mt-0.5">{e.description}</p>}
                <p className="text-xs text-muted dark:text-dark-muted mt-0.5">{new Date(e.created_at).toLocaleString()} · {e.created_by}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
