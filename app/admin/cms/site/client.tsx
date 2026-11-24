'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminSaveSiteSettings, adminUploadCmsAsset } from '@/lib/actions/account';
import { saveButtonColor } from '@/lib/actions/admin';
import type { SiteSettings } from '@/lib/types';

const DEFAULT_COLOR = '#A8472D';

/** Returns true when a string is a valid 3 or 6-digit hex color. */
function isValidHex(v: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v.trim());
}

export default function SiteSettingsClient({ settings }: { settings: SiteSettings }) {
  const router = useRouter();

  // --- Existing settings state ---
  const [announcementText, setAnnouncement] = useState(settings.announcement_text ?? '');
  const [announcementActive, setAnnouncementActive] = useState(settings.announcement_active);
  const [seoTitle, setSeoTitle] = useState(settings.seo_title ?? '');
  const [metaDesc, setMetaDesc] = useState(settings.meta_description ?? '');
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // --- Button color state ---
  const [btnColor, setBtnColor] = useState<string>(settings.button_color ?? DEFAULT_COLOR);
  const [btnColorInput, setBtnColorInput] = useState<string>(settings.button_color ?? DEFAULT_COLOR);
  const [savingColor, setSavingColor] = useState(false);
  const [colorMsg, setColorMsg] = useState<string | null>(null);
  const [colorErr, setColorErr] = useState<string | null>(null);

  function onColorPickerChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    setBtnColor(v);
    setBtnColorInput(v);
  }

  function onColorTextChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBtnColorInput(v);
    if (isValidHex(v)) setBtnColor(v.toUpperCase());
  }

  async function onSaveColor() {
    setColorErr(null);
    setColorMsg(null);
    if (!isValidHex(btnColorInput)) {
      setColorErr('Enter a valid hex color, e.g. #A8472D.');
      return;
    }
    const normalized = btnColorInput.trim().toUpperCase();
    setSavingColor(true);
    const res = await saveButtonColor(normalized);
    setSavingColor(false);
    if (!res.ok) { setColorErr(res.error); return; }
    setBtnColor(normalized);
    setBtnColorInput(normalized);
    setColorMsg('Button color saved. Refresh the public site to see the change.');
    router.refresh();
  }

  function onResetColor() {
    setBtnColor(DEFAULT_COLOR);
    setBtnColorInput(DEFAULT_COLOR);
    setColorErr(null);
    setColorMsg(null);
  }

  // --- Existing upload & save ---
  async function onUpload(field: 'logo' | 'favicon', e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('field', field);
    setUploading(field);
    const res = await adminUploadCmsAsset(fd);
    setUploading(null);
    if (!res.ok) { setErr(res.error); return; }
    if (field === 'logo') setLogoUrl(res.url);
    setMsg(`${field} uploaded.`);
    router.refresh();
    e.target.value = '';
  }

  async function onSave() {
    setErr(null); setMsg(null);
    setSaving(true);
    const res = await adminSaveSiteSettings({
      announcement_text: announcementText,
      announcement_active: announcementActive,
      seo_title: seoTitle,
      meta_description: metaDesc,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Site settings</h1>
      <div className="flex flex-col gap-8 max-w-xl">

        {/* --- Logo --- */}
        <section>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Store logo</h2>
          {logoUrl && (
            <div className="border border-line dark:border-dark-line p-2 inline-block mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            </div>
          )}
          <label className="btn btn-outline cursor-pointer">
            {uploading === 'logo' ? 'Uploading' : 'Upload logo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload('logo', e)} />
          </label>
        </section>

        {/* --- Announcement bar --- */}
        <section>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Announcement bar</h2>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={announcementActive} onChange={(e) => setAnnouncementActive(e.target.checked)} />
            Show announcement bar on all pages
          </label>
          <div className="field">
            <label htmlFor="ann">Announcement text</label>
            <input id="ann" className="input" value={announcementText} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Free delivery on orders above Rs 3,000" />
          </div>
        </section>

        {/* --- SEO --- */}
        <section>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">SEO</h2>
          <div className="flex flex-col gap-3">
            <div className="field">
              <label htmlFor="seo-title">Page title</label>
              <input id="seo-title" className="input" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Atlas Clothier - Seasonal Clothing" />
              <p className="text-xs text-muted dark:text-dark-muted">Shown in browser tab and search results.</p>
            </div>
            <div className="field">
              <label htmlFor="meta-desc">Meta description</label>
              <textarea id="meta-desc" className="input" rows={3} value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} placeholder="Short description for search engines." />
            </div>
          </div>
        </section>

        {err && <p className="text-sm theme-text">{err}</p>}
        {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : 'Save settings'}
        </button>

        {/* ----------------------------------------------------------------
            Global button color
        ---------------------------------------------------------------- */}
        <section className="border-t border-line dark:border-dark-line pt-6">
          <h2 className="font-medium mb-1 text-ink dark:text-dark-ink">Global theme color</h2>
          <p className="text-sm text-muted dark:text-dark-muted mb-4">
            Controls the accent color used across the entire website: primary buttons, active links, navigation highlights, focus rings, order status indicators, tracking progress, and image selection. Default: {DEFAULT_COLOR}.
          </p>

          <div className="flex flex-wrap items-end gap-4 mb-4">
            {/* Color picker */}
            <div className="field">
              <label htmlFor="btn-color-picker">Color picker</label>
              <input
                id="btn-color-picker"
                type="color"
                className="h-10 w-16 cursor-pointer border border-line dark:border-dark-line p-0.5 bg-canvas dark:bg-dark-canvas"
                value={btnColor}
                onChange={onColorPickerChange}
              />
            </div>

            {/* Hex text input */}
            <div className="field">
              <label htmlFor="btn-color-hex">Hex value</label>
              <input
                id="btn-color-hex"
                className={`input w-36 font-mono uppercase ${!isValidHex(btnColorInput) ? 'theme-border' : ''}`}
                value={btnColorInput}
                onChange={onColorTextChange}
                maxLength={7}
                placeholder="#A8472D"
              />
              {!isValidHex(btnColorInput) && (
                <p className="text-xs theme-text">Invalid hex color</p>
              )}
            </div>

            {/* Live preview */}
            <div className="field">
              <label>Preview</label>
              <button
                type="button"
                className="btn"
                style={{ backgroundColor: isValidHex(btnColor) ? btnColor : DEFAULT_COLOR, color: '#fffdf9', borderColor: isValidHex(btnColor) ? btnColor : DEFAULT_COLOR }}
                disabled
              >
                Button preview
              </button>
            </div>
          </div>

          {colorErr && <p className="text-sm theme-text mb-3">{colorErr}</p>}
          {colorMsg && <p className="text-sm text-muted dark:text-dark-muted mb-3">{colorMsg}</p>}

          <div className="flex gap-3">
            <button className="btn btn-primary" onClick={onSaveColor} disabled={savingColor || !isValidHex(btnColorInput)}>
              {savingColor ? 'Saving' : 'Save theme color'}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={onResetColor}
              title={`Reset to default: ${DEFAULT_COLOR}`}
            >
              Reset to default
            </button>
          </div>
          <p className="text-xs text-muted dark:text-dark-muted mt-3">
            After saving, the new color is applied to: primary buttons, accent links, active navigation items, focus rings, order tracking progress, gallery selection highlights, and all accent-colored elements across the public website and admin panel.
          </p>
        </section>
      </div>
    </div>
  );
}
