'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { savePaymentGateway } from '@/lib/actions/admin';

interface Field {
  key: string;
  label: string;
  type: 'text' | 'select' | 'secret';
  options?: string[];
}

export default function GatewayConfigForm({
  gateway,
  label,
  fields,
  values: initialValues,
  savedSecretFields,
}: {
  gateway: string;
  label: string;
  fields: Field[];
  /** Non-secret values only; secret values never reach the browser. */
  values: Record<string, string>;
  savedSecretFields: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      // Secret fields always start blank; a saved secret stays untouched
      // unless the admin types a replacement.
      init[f.key] = f.type === 'secret' ? '' : (initialValues[f.key] ?? '');
    }
    return init;
  });
  const hasSavedSecret = (key: string) => savedSecretFields.includes(key);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggleReveal(key: string) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSave() {
    setErr(null);
    setMsg(null);

    // Blank secret fields are omitted entirely; the server action keeps the
    // saved value. That way secrets never have to be sent to the browser.
    const payload: Record<string, string> = {};
    for (const f of fields) {
      const value = values[f.key] ?? '';
      if (f.type === 'secret' && value === '') continue;
      payload[f.key] = value;
    }

    setSaving(true);
    const res = await savePaymentGateway(gateway, payload);
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg('Credentials saved. Gateway remains inactive until fully integrated.');
    router.refresh();
  }

  const secretsSaved = fields
    .filter((f) => f.type === 'secret')
    .some((f) => hasSavedSecret(f.key));

  return (
    <div className="max-w-md flex flex-col gap-4">
      {secretsSaved && (
        <div className="border border-line dark:border-dark-line p-3 text-sm text-muted dark:text-dark-muted">
          Existing secret credentials are saved. Leave secret fields blank to keep them unchanged.
        </div>
      )}

      {fields.map((f) => (
        <div key={f.key} className="field">
          <label htmlFor={`gw-${f.key}`}>{f.label}</label>

          {f.type === 'select' ? (
            <select
              id={`gw-${f.key}`}
              className="input"
              value={values[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">Select</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          ) : f.type === 'secret' ? (
            <div className="flex gap-2">
              <input
                id={`gw-${f.key}`}
                type={revealed[f.key] ? 'text' : 'password'}
                className="input flex-1 font-mono"
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={hasSavedSecret(f.key) ? '••••••• (saved)' : 'Enter value'}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost text-xs px-2"
                onClick={() => toggleReveal(f.key)}
                tabIndex={-1}
              >
                {revealed[f.key] ? 'Hide' : 'Show'}
              </button>
            </div>
          ) : (
            <input
              id={`gw-${f.key}`}
              type="text"
              className="input"
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}

      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : 'Save credentials'}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => router.push('/admin/payments')}
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-muted dark:text-dark-muted">
        Credentials are stored server-side only and are never sent to customer browsers.
        {label} will not appear as a checkout option until the gateway integration is fully implemented.
      </p>
    </div>
  );
}
