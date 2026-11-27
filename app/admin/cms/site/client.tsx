'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminSaveSiteSettings,
  adminUploadCmsAsset,
  adminSaveLogoBranding,
  type LogoBrandingInput,
} from '@/lib/actions/account';
import { saveButtonColor } from '@/lib/actions/admin';
import type { SiteSettings } from '@/lib/types';

const DEFAULT_COLOR = '#A8472D';

function isValidHex(v: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v.trim());
}

const FONT_OPTIONS = [
  { value: 'serif',      label: 'Serif (Fraunces)' },
  { value: 'sans',       label: 'Sans-serif (IBM Plex Sans)' },
  { value: 'Georgia',    label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Arial',      label: 'Arial' },
  { value: 'Helvetica',  label: 'Helvetica' },
  { value: 'Verdana',    label: 'Verdana' },
];

const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semibold (600)' },
  { value: '700', label: 'Bold (700)' },
];

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

  // --- Logo branding state ---
  const [logoMode, setLogoMode] = useState<'image' | 'text'>(settings.logo_mode ?? 'text');
  const [logoText, setLogoText] = useState(settings.logo_text ?? settings.store_name ?? '');
  const [logoFont, setLogoFont] = useState(settings.logo_font ?? 'serif');
  const [logoFontSize, setLogoFontSize] = useState(settings.logo_font_size ?? '1.5rem');
  const [logoFontWeight, setLogoFontWeight] = useState(settings.logo_font_weight ?? '400');
  const [logoColor, setLogoColor] = useState(settings.logo_color ?? '#1B1A18');
  const [logoLetterSpacing, setLogoLetterSpacing] = useState(settings.logo_letter_spacing ?? 'normal');
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);

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
    setColorMsg('Theme color saved.');
    router.refresh();
  }

  function onResetColor() {
    setBtnColor(DEFAULT_COLOR);
    setBtnColorInput(DEFAULT_COLOR);
    setColorErr(null);
    setColorMsg(null);
  }

  async function onSaveLogo() {
    setLogoErr(null);
    setLogoMsg(null);
    setSavingLogo(true);
    const input: LogoBrandingInput = {
      logo_mode:           logoMode,
      logo_text:           logoText,
      logo_font:           logoFont,
      logo_font_size:      logoFontSize,
      logo_font_weight:    logoFontWeight,
      logo_color:          logoColor,
      logo_letter_spacing: logoLetterSpacing,
    };
    const res = await adminSaveLogoBranding(input);
    setSavingLogo(false);
    if (!res.ok) { setLogoErr(res.error); return; }
    setLogoMsg('Logo settings saved.');
    router.refresh();
  }

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

  // Live preview font family
  const previewFontFamily =
    logoFont === 'serif'
      ? 'var(--font-fraunces), Georgia, serif'
      : logoFont === 'sans'
        ? 'var(--font-inter), system-ui, sans-serif'
        : logoFont;

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6 text-ink dark:text-dark-ink">Site settings</h1>
      <div className="flex flex-col gap-8 max-w-xl">

        {/* ----------------------------------------------------------------
            Logo & Branding
        ---------------------------------------------------------------- */}
        <section>
          <h2 className="font-medium mb-3 text-ink dark:text-dark-ink">Logo &amp; Branding</h2>

          {/* Mode selector */}
          <div className="flex gap-6 mb-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="logo_mode" value="image" checked={logoMode === 'image'} onChange={() => setLogoMode('image')} />
              Image logo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="logo_mode" value="text" checked={logoMode === 'text'} onChange={() => setLogoMode('text')} />
              Text logo
            </label>
          </div>

          {logoMode === 'image' ? (
            <div className="flex flex-col gap-3">
              {logoUrl ? (
                <div className="border border-line dark:border-dark-line p-3 inline-flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
                  <p className="text-xs text-muted dark:text-dark-muted">Current logo</p>
                </div>
              ) : (
                <p className="text-sm text-muted dark:text-dark-muted">No image uploaded yet. Text fallback will be used.</p>
              )}
              <label className="btn btn-outline cursor-pointer w-fit">
                {uploading === 'logo' ? 'Uploading...' : logoUrl ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onUpload('logo', e)} />
              </label>
              <p className="text-xs text-muted dark:text-dark-muted">
                Recommended: PNG or SVG with transparent background, max height 48px.
              </p>
            </div>
          ) : (
            /* Text logo settings */
            <div className="flex flex-col gap-3">
              <div className="field">
                <label htmlFor="logo-text">Logo text</label>
                <input id="logo-text" className="input" value={logoText} onChange={(e) => setLogoText(e.target.value)} placeholder={settings.store_name} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label htmlFor="logo-font">Font</label>
                  <select id="logo-font" className="input" value={logoFont} onChange={(e) => setLogoFont(e.target.value)}>
                    {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="logo-weight">Weight</label>
                  <select id="logo-weight" className="input" value={logoFontWeight} onChange={(e) => setLogoFontWeight(e.target.value)}>
                    {WEIGHT_OPTIONS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label htmlFor="logo-size">Font size</label>
                  <input id="logo-size" className="input" value={logoFontSize} onChange={(e) => setLogoFontSize(e.target.value)} placeholder="1.5rem" />
                </div>
                <div className="field">
                  <label htmlFor="logo-spacing">Letter spacing</label>
                  <input id="logo-spacing" className="input" value={logoLetterSpacing} onChange={(e) => setLogoLetterSpacing(e.target.value)} placeholder="normal" />
                </div>
              </div>
              <div className="field max-w-[12rem]">
                <label htmlFor="logo-color">Color</label>
                <div className="flex gap-2 items-center">
                  <input id="logo-color-picker" type="color" className="h-9 w-12 border border-line dark:border-dark-line p-0.5 cursor-pointer" value={logoColor} onChange={(e) => setLogoColor(e.target.value.toUpperCase())} />
                  <input id="logo-color" className="input font-mono uppercase" value={logoColor} onChange={(e) => setLogoColor(e.target.value)} maxLength={7} />
                </div>
              </div>
              {/* Live preview */}
              <div className="border border-line dark:border-dark-line p-4 bg-canvas dark:bg-dark-canvas">
                <p className="text-xs text-muted dark:text-dark-muted mb-2">Preview</p>
                <span style={{ fontFamily: previewFontFamily, fontSize: logoFontSize, fontWeight: logoFontWeight, color: logoColor, letterSpacing: logoLetterSpacing === 'normal' ? undefined : logoLetterSpacing }}>
                  {logoText || settings.store_name || 'Atlas Clothier'}
                </span>
              </div>
            </div>
          )}

          {logoErr && <p className="text-sm theme-text mt-2">{logoErr}</p>}
          {logoMsg && <p className="text-sm text-muted dark:text-dark-muted mt-2">{logoMsg}</p>}
          <button className="btn btn-primary mt-3" onClick={onSaveLogo} disabled={savingLogo}>
            {savingLogo ? 'Saving' : 'Save logo settings'}
          </button>
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
            Global theme color
        ---------------------------------------------------------------- */}
        <section className="border-t border-line dark:border-dark-line pt-6">
          <h2 className="font-medium mb-1 text-ink dark:text-dark-ink">Global theme color</h2>
          <p className="text-sm text-muted dark:text-dark-muted mb-4">
            Controls the accent color across the website. Default: {DEFAULT_COLOR}.
          </p>

          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="field">
              <label htmlFor="btn-color-picker">Color picker</label>
              <input id="btn-color-picker" type="color" className="h-10 w-16 cursor-pointer border border-line dark:border-dark-line p-0.5 bg-canvas dark:bg-dark-canvas" value={btnColor} onChange={onColorPickerChange} />
            </div>
            <div className="field">
              <label htmlFor="btn-color-hex">Hex value</label>
              <input id="btn-color-hex" className={`input w-36 font-mono uppercase ${!isValidHex(btnColorInput) ? 'theme-border' : ''}`} value={btnColorInput} onChange={onColorTextChange} maxLength={7} placeholder="#A8472D" />
              {!isValidHex(btnColorInput) && <p className="text-xs theme-text">Invalid hex color</p>}
            </div>
            <div className="field">
              <label>Preview</label>
              <button type="button" className="btn" style={{ backgroundColor: isValidHex(btnColor) ? btnColor : DEFAULT_COLOR, color: '#fffdf9', borderColor: isValidHex(btnColor) ? btnColor : DEFAULT_COLOR }} disabled>
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
            <button type="button" className="btn btn-ghost text-sm" onClick={onResetColor} title={`Reset to default: ${DEFAULT_COLOR}`}>
              Reset to default
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
