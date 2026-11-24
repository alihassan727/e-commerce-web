'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSaveFeature, adminDeleteFeature } from '@/lib/actions/account';
import type { CmsFeature } from '@/lib/types';

function emptyFeature(): Partial<CmsFeature> {
  return { icon: '', heading: '', description: '', is_active: true, sort_order: 0 };
}

export default function FeaturesAdminClient({ initialFeatures }: { initialFeatures: CmsFeature[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<CmsFeature> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!editing) return;
    setErr(null);
    if (!editing.heading?.trim()) { setErr('Heading is required.'); return; }
    setSaving(true);
    const res = await adminSaveFeature({
      id: editing.id,
      icon: editing.icon ?? '',
      heading: editing.heading,
      description: editing.description ?? '',
      is_active: editing.is_active ?? true,
      sort_order: editing.sort_order ?? 0,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this feature?')) return;
    await adminDeleteFeature(id);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Homepage features</h1>
        {!editing && (
          <button className="btn btn-primary" onClick={() => setEditing(emptyFeature())}>Add feature</button>
        )}
      </div>
      <p className="text-sm text-muted dark:text-dark-muted mb-6">These appear as icons/cards on your homepage.</p>

      {editing && (
        <div className="border border-line dark:border-dark-line p-4 mb-6 max-w-md">
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">{editing.id ? 'Edit' : 'New'} feature</h2>
          <div className="flex flex-col gap-3">
            <div className="field">
              <label>Icon (emoji or text)</label>
              <input className="input" value={editing.icon ?? ''} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="🚚" />
            </div>
            <div className="field">
              <label>Heading</label>
              <input className="input" value={editing.heading ?? ''} onChange={(e) => setEditing({ ...editing, heading: e.target.value })} />
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>Display order</label>
                <input type="number" className="input" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            {err && <p className="text-sm theme-text">{err}</p>}
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
              <button className="btn btn-ghost" onClick={() => { setEditing(null); setErr(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {initialFeatures.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No features yet.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {initialFeatures.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xl">{f.icon}</span>
                <div>
                  <p className="font-medium text-ink dark:text-dark-ink">{f.heading}</p>
                  {f.description && <p className="text-muted dark:text-dark-muted">{f.description}</p>}
                </div>
              </div>
              <div className="flex gap-3">
                <button className="theme-text" onClick={() => setEditing(f)}>Edit</button>
                <button className="text-muted dark:text-dark-muted" onClick={() => onDelete(f.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
