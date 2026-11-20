'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOrderStatus } from '@/lib/actions/admin';
import { ADMIN_SETTABLE_STATUSES, ORDER_STATUS_LABELS } from '@/lib/order-status';
import type { OrderStatus } from '@/lib/types';

export default function OrderStatusForm({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    setErr(null);
    setBusy(true);
    const res = await updateOrderStatus(orderId, value);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <select
        className="input max-w-[12rem]"
        value={value}
        onChange={(e) => setValue(e.target.value as OrderStatus)}
      >
        {ADMIN_SETTABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
        {busy ? 'Updating' : 'Update status'}
      </button>
      {err && <span className="text-sm text-clay">{err}</span>}
    </div>
  );
}
