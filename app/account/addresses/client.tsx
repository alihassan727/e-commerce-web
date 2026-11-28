'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAddress, deleteAddress, setDefaultAddress } from '@/lib/actions/account';
import type { CustomerAddress } from '@/lib/types';

const LABELS = ['Home', 'Office', 'Other'];

function empty(): Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at'> {
  return { label: 'Home', full_name: '', phone: '', address: '', city: '', postal_code: '', is_default: false };
}

export default function AddressBook({
  initialAddresses,
}: {
  initialAddresses: CustomerAddress[];
}) {
  const router = useRouter();
  // Show the form immediately when the address book is empty so a customer can
  // add their first address without an extra step.
  const [editing, setEditing] = useState<Partial<CustomerAddress> | null>(
    initialAddresses.length === 0 ? empty() : null,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!editing) return;
    setErr(null);
    setSaving(true);
    const res = await saveAddress({
      id: editing.id,
      label: editing.label ?? 'Home',
      full_name: editing.full_name ?? '',
      phone: editing.phone ?? '',
      address: editing.address ?? '',
      city: editing.city ?? '',
      postal_code: editing.postal_code ?? '',
      is_default: editing.is_default ?? false,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm('Remove this address?')) return;
    await deleteAddress(id);
    router.refresh();
  }

  async function onSetDefault(id: string) {
    await setDefaultAddress(id);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Delivery addresses</h1>
        {!editing && (
          <button className="btn btn-primary" onClick={() => setEditing(empty())}>
            Add address
          </button>
        )}
      </div>

      {/* Edit / Add form */}
      {editing && (
        <div className="border border-line dark:border-dark-line p-4 mb-6 max-w-md">
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">
            {editing.id ? 'Edit address' : 'New address'}
          </h2>
          <div className="flex flex-col gap-3">
            <div className="field">
              <label>Label</label>
              <select className="input" value={editing.label ?? 'Home'} onChange={(e) => setEditing({ ...editing, label: e.target.value })}>
                {LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Full name</label>
              <input className="input" value={editing.full_name ?? ''} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input" value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>City</label>
                <input className="input" value={editing.city ?? ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
              </div>
              <div className="field">
                <label>Postal code</label>
                <input className="input" value={editing.postal_code ?? ''} onChange={(e) => setEditing({ ...editing, postal_code: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_default ?? false} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
              Set as default address
            </label>
            {err && <p className="text-sm theme-text">{err}</p>}
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
              <button className="btn btn-ghost" onClick={() => { setEditing(null); setErr(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Address list */}
      {initialAddresses.length === 0 ? (
        <div className="border border-line dark:border-dark-line p-8 text-center">
          <p className="text-muted dark:text-dark-muted text-sm">No saved addresses yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {initialAddresses.map((addr) => (
            <div key={addr.id} className="border border-line dark:border-dark-line p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-ink dark:text-dark-ink">{addr.label}</span>
                  {addr.is_default && (
                    <span className="border theme-border theme-text text-xs px-1">Default</span>
                  )}
                </div>
                <p className="text-ink dark:text-dark-ink">{addr.full_name}</p>
                <p className="text-muted dark:text-dark-muted">{addr.address}, {addr.city}</p>
                {addr.phone && <p className="text-muted dark:text-dark-muted">{addr.phone}</p>}
              </div>
              <div className="flex gap-3 text-sm">
                <button className="theme-text" onClick={() => setEditing(addr)}>Edit</button>
                {!addr.is_default && (
                  <button className="text-muted dark:text-dark-muted" onClick={() => onSetDefault(addr.id)}>Set default</button>
                )}
                <button className="text-muted dark:text-dark-muted" onClick={() => onDelete(addr.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
