'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSaveSocialLink, adminDeleteSocialLink } from '@/lib/actions/account';
import type { SocialLink } from '@/lib/types';

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest'];

function empty(): Partial<SocialLink> {
  return { platform: 'instagram', url: '', is_active: true, sort_order: 0 };
}

export default function SocialAdminClient({ initialLinks }: { initialLinks: SocialLink[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<SocialLink> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!editing) return;
    setErr(null);
    setSaving(true);
    const res = await adminSaveSocialLink({
      id: editing.id,
      platform: editing.platform ?? 'instagram',
      url: editing.url ?? '',
      is_active: editing.is_active ?? true,
      sort_order: editing.sort_order ?? 0,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setEditing(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!window.confirm('Remove this link?')) return;
    await adminDeleteSocialLink(id);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl text-ink dark:text-dark-ink">Social media links</h1>
        {!editing && <button className="btn btn-primary" onClick={() => setEditing(empty())}>Add link</button>}
      </div>

      {editing && (
        <div className="border border-line dark:border-dark-line p-4 mb-6 max-w-md">
          <div className="flex flex-col gap-3">
            <div className="field">
              <label>Platform</label>
              <select className="input" value={editing.platform ?? 'instagram'} onChange={(e) => setEditing({ ...editing, platform: e.target.value })}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>URL</label>
              <input className="input" value={editing.url ?? ''} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              Active
            </label>
            {err && <p className="text-sm theme-text">{err}</p>}
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving' : 'Save'}</button>
              <button className="btn btn-ghost" onClick={() => { setEditing(null); setErr(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {initialLinks.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No social links added.</p>
      ) : (
        <div className="border border-line dark:border-dark-line">
          {initialLinks.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-3 border-b border-line dark:border-dark-line last:border-0 text-sm">
              <div>
                <p className="font-medium text-ink dark:text-dark-ink capitalize">{l.platform}</p>
                <p className="text-muted dark:text-dark-muted truncate max-w-xs">{l.url}</p>
              </div>
              <div className="flex gap-3">
                <button className="theme-text" onClick={() => setEditing(l)}>Edit</button>
                <button className="text-muted dark:text-dark-muted" onClick={() => onDelete(l.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
