'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile } from '@/lib/actions/account';

interface ProfileFormProps {
  name: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
}

export function ProfileClientForm({ initialData }: { initialData: ProfileFormProps }) {
  const router = useRouter();
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function set(k: keyof ProfileFormProps, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    const res = await updateProfile(form);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg('Profile saved.');
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Edit profile</h1>
      <div className="flex flex-col gap-4 max-w-md">
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input id="phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="address">Default address</label>
          <input id="address" className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="postal_code">Postal code</label>
            <input id="postal_code" className="input" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
          </div>
        </div>
        {err && <p className="text-sm theme-text">{err}</p>}
        {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}
