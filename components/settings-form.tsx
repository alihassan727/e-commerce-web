'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSettings } from '@/lib/actions/admin';
import type { SiteSettings } from '@/lib/types';

export default function SettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(settings.store_name);
  const [contactEmail, setContactEmail] = useState(settings.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(settings.contact_phone ?? '');
  const [currency, setCurrency] = useState(settings.currency);
  const [deliveryFee, setDeliveryFee] = useState(settings.delivery_fee);
  const [deliveryAreas, setDeliveryAreas] = useState(
    (settings.delivery_areas ?? []).join('\n'),
  );
  const [lowStock, setLowStock] = useState(settings.low_stock_threshold);
  const [codNotes, setCodNotes] = useState(settings.cod_notes ?? '');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    setErr(null);
    setMsg(null);
    setSaving(true);
    const res = await saveSettings({
      store_name: storeName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      currency,
      delivery_fee: Number(deliveryFee) || 0,
      delivery_areas: deliveryAreas.split('\n'),
      low_stock_threshold: Number(lowStock) || 0,
      cod_notes: codNotes,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="field">
        <label htmlFor="store-name">Store name</label>
        <input id="store-name" className="input" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <label htmlFor="contact-email">Contact email</label>
          <input id="contact-email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="contact-phone">Contact phone</label>
          <input id="contact-phone" className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <label htmlFor="currency">Currency code</label>
          <input id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="PKR" />
        </div>
        <div className="field">
          <label htmlFor="delivery-fee">Delivery fee</label>
          <input id="delivery-fee" type="number" step="0.01" className="input" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="delivery-areas">Delivery areas (one per line)</label>
        <textarea id="delivery-areas" className="input" rows={4} value={deliveryAreas} onChange={(e) => setDeliveryAreas(e.target.value)} />
      </div>
      <div className="field max-w-[12rem]">
        <label htmlFor="low-stock">Low stock threshold</label>
        <input id="low-stock" type="number" className="input" value={lowStock} onChange={(e) => setLowStock(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="cod-notes">Cash on delivery notes</label>
        <textarea id="cod-notes" className="input" rows={2} value={codNotes} onChange={(e) => setCodNotes(e.target.value)} />
      </div>

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
