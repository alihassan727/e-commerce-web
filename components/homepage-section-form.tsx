'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveHomepageSection, type HomepageSectionInput } from '@/lib/actions/admin';
import type { Category, HomepageSection, HomepageSectionType } from '@/lib/types';
import { getImageUrl, getHeroImageUrl } from '@/lib/storage';

interface ProductLite {
  id: string;
  title: string;
  is_active: boolean;
}

// Desktop: 1920×650 → ratio 2.95:1 (wide banner)
// Mobile: 900×1125 → ratio 0.8:1 (portrait)
const DESKTOP_RATIO = 1920 / 650;
const MOBILE_RATIO = 900 / 1125;
const RATIO_TOLERANCE = 0.15; // 15% tolerance before we show a warning

function ratioWarning(w: number, h: number, target: number): string | null {
  if (h === 0) return null;
  const actual = w / h;
  const diff = Math.abs(actual - target) / target;
  if (diff > RATIO_TOLERANCE) {
    return `Image is ${w}×${h}px. Recommended ratio is ${
      target > 1 ? '1920×650 (wide)' : '900×1125 (portrait)'
    }. The image may appear cropped or stretched.`;
  }
  return null;
}

/** Upload a file to the cms-assets bucket and return the public URL. */
async function uploadHeroImage(
  file: File,
  slot: 'desktop' | 'mobile',
  supabaseUrl: string,
): Promise<{ url: string; path: string } | { error: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `hero/${slot}-${Date.now()}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/cms-assets/${path}`;

  // We cannot use the service-role key from the browser.
  // Instead we call a server action via FormData.
  const { adminUploadCmsAsset } = await import('@/lib/actions/account');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('field', `hero-${slot}`);
  const result = await adminUploadCmsAsset(fd);
  if (!result.ok) return { error: result.error };
  return { url: result.url, path: result.url.split('/cms-assets/')[1] ?? path };
}

// ---------------------------------------------------------------------------
// Hero image uploader subcomponent
// ---------------------------------------------------------------------------
function HeroImageUploader({
  slot,
  label,
  dimensionHint,
  currentPath,
  previewUrl,
  onUploaded,
  onRemove,
}: {
  slot: 'desktop' | 'mobile';
  label: string;
  dimensionHint: string;
  currentPath: string;
  previewUrl: string | null;
  onUploaded: (path: string, localUrl: string, warning: string | null) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setWarn(null);

    // Show local preview while uploading.
    const localUrl = URL.createObjectURL(file);

    // Measure dimensions before upload.
    const img = new Image();
    img.src = localUrl;
    await new Promise<void>((res) => { img.onload = () => res(); });
    const warning = ratioWarning(
      img.naturalWidth,
      img.naturalHeight,
      slot === 'desktop' ? DESKTOP_RATIO : MOBILE_RATIO,
    );

    setUploading(true);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const result = await uploadHeroImage(file, slot, supabaseUrl);
    setUploading(false);

    if ('error' in result) {
      setErr(result.error);
      return;
    }
    setWarn(warning);
    onUploaded(result.path, result.url, warning);
    e.target.value = '';
  }

  return (
    <div className="border border-line dark:border-dark-line p-3 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="font-medium text-sm text-ink dark:text-dark-ink">{label}</p>
        <p className="text-xs text-muted dark:text-dark-muted">{dimensionHint}</p>
      </div>

      {/* Preview */}
      {previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className={`w-full object-cover ${slot === 'desktop' ? 'max-h-28' : 'max-h-40'}`}
          />
          <button
            type="button"
            className="absolute top-1 right-1 bg-canvas dark:bg-dark-canvas border border-line dark:border-dark-line text-xs px-2 py-0.5"
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="theme-tint flex items-center justify-center text-muted text-sm"
          style={{ height: slot === 'desktop' ? '5rem' : '8rem' }}>
          No image
        </div>
      )}

      {warn && <p className="text-xs theme-text">{warn}</p>}
      {err && <p className="text-xs theme-text">{err}</p>}

      <label className={`btn btn-ghost text-sm cursor-pointer ${uploading ? 'opacity-60' : ''}`}>
        {uploading ? 'Uploading...' : previewUrl ? 'Replace image' : 'Upload image'}
        <input type="file" accept="image/*" className="hidden" onChange={onChange} disabled={uploading} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live preview components
// ---------------------------------------------------------------------------
function HeroPreview({
  heading, subtext, ctaLabel, desktopPreview, mobilePreview, isMobileView,
}: {
  heading: string; subtext: string; ctaLabel: string;
  desktopPreview: string | null; mobilePreview: string | null;
  isMobileView: boolean;
}) {
  const bg = isMobileView ? mobilePreview : desktopPreview;
  return (
    <div
      className="relative overflow-hidden border border-line dark:border-dark-line flex items-end"
      style={{ height: isMobileView ? '18rem' : '10rem' }}
    >
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 theme-tint" />
      )}
      <div className="absolute inset-0 bg-canvas/60" />
      <div className="relative z-10 p-4">
        <p className="text-xs theme-text">New arrivals</p>
        <p className="font-serif text-lg text-ink leading-tight mt-1">
          {heading || 'Your heading here'}
        </p>
        {subtext && <p className="text-xs text-muted mt-1">{subtext}</p>}
        {ctaLabel && (
          <span className="inline-block mt-2 text-xs btn btn-primary py-1 px-2">{ctaLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------
export default function HomepageSectionForm({
  section,
  categories,
  products,
}: {
  section: HomepageSection | null;
  categories: Category[];
  products: ProductLite[];
}) {
  const router = useRouter();
  const editing = Boolean(section);

  const cfg = (section?.config ?? {}) as Record<string, unknown>;
  const [type, setType] = useState<HomepageSectionType>(section?.type ?? 'hero');
  const [title, setTitle] = useState(section?.title ?? '');
  const [categoryId, setCategoryId] = useState(section?.category_id ?? '');
  const [isActive, setIsActive] = useState(section?.is_active ?? true);

  // Hero fields
  const [heading, setHeading] = useState<string>((cfg.heading as string) ?? '');
  const [subtext, setSubtext] = useState<string>((cfg.subtext as string) ?? '');
  const [ctaLabel, setCtaLabel] = useState<string>((cfg.cta_label as string) ?? '');
  const [ctaHref, setCtaHref] = useState<string>((cfg.cta_href as string) ?? '');
  // Desktop/mobile image paths stored in config JSONB
  const [desktopPath, setDesktopPath] = useState<string>(
    (cfg.desktop_image_path as string) ?? (cfg.image_path as string) ?? '',
  );
  const [mobilePath, setMobilePath] = useState<string>(
    (cfg.mobile_image_path as string) ?? '',
  );
  // Local preview URLs (can be object URLs or Supabase public URLs)
  const [desktopPreview, setDesktopPreview] = useState<string | null>(
    getHeroImageUrl(desktopPath) ?? null,
  );
  const [mobilePreview, setMobilePreview] = useState<string | null>(
    getHeroImageUrl(mobilePath) ?? null,
  );

  // Featured products
  const initialIds = Array.isArray(cfg.product_ids) ? (cfg.product_ids as string[]) : [];
  const [productIds, setProductIds] = useState<string[]>(initialIds);

  // Preview mode
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(type === 'hero');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleProduct(id: string) {
    setProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (type === 'hero') {
      config.heading = heading;
      config.subtext = subtext;
      config.cta_label = ctaLabel;
      config.cta_href = ctaHref;
      if (desktopPath) config.desktop_image_path = desktopPath;
      if (mobilePath) config.mobile_image_path = mobilePath;
    } else if (type === 'featured') {
      config.product_ids = productIds;
    }

    const input: HomepageSectionInput = {
      id: section?.id,
      type,
      title: title || null,
      category_id: type === 'category' ? categoryId || null : null,
      config,
      is_active: isActive,
    };
    const res = await saveHomepageSection(input);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMsg('Saved.');
    if (!editing) router.push(`/admin/homepage/${res.id}`);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* Section type */}
      <div className="field max-w-xs">
        <label htmlFor="hs-type">Section type</label>
        <select
          id="hs-type"
          className="input"
          value={type}
          onChange={(e) => {
            const t = e.target.value as HomepageSectionType;
            setType(t);
            setShowPreview(t === 'hero');
          }}
          disabled={editing}
        >
          <option value="hero">Hero</option>
          <option value="category">Category</option>
          <option value="featured">Featured products</option>
        </select>
      </div>

      {/* Title */}
      <div className="field max-w-xs">
        <label htmlFor="hs-title">Section title (optional)</label>
        <input id="hs-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* Category picker */}
      {type === 'category' && (
        <div className="field max-w-xs">
          <label htmlFor="hs-category">Category</label>
          <select id="hs-category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Hero editor + preview */}
      {type === 'hero' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: fields */}
          <div className="flex flex-col gap-4 border border-line dark:border-dark-line p-4">
            <p className="font-medium text-ink dark:text-dark-ink">Hero content</p>

            <div className="field">
              <label htmlFor="hs-heading">Heading</label>
              <input id="hs-heading" className="input" value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="Seasonal clothing, made well." />
            </div>
            <div className="field">
              <label htmlFor="hs-subtext">Subtext</label>
              <textarea id="hs-subtext" className="input" rows={2} value={subtext} onChange={(e) => setSubtext(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="hs-cta-label">Button label</label>
                <input id="hs-cta-label" className="input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Shop now" />
              </div>
              <div className="field">
                <label htmlFor="hs-cta-href">Button link</label>
                <input id="hs-cta-href" className="input" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/shop" />
              </div>
            </div>

            {/* Desktop image */}
            <HeroImageUploader
              slot="desktop"
              label="Desktop hero image"
              dimensionHint="Recommended: 1920 x 650 px (wide)"
              currentPath={desktopPath}
              previewUrl={desktopPreview}
              onUploaded={(path, url) => {
                setDesktopPath(path);
                setDesktopPreview(url);
              }}
              onRemove={() => { setDesktopPath(''); setDesktopPreview(null); }}
            />

            {/* Mobile image */}
            <HeroImageUploader
              slot="mobile"
              label="Mobile hero image (optional)"
              dimensionHint="Recommended: 900 x 1125 px (portrait)"
              currentPath={mobilePath}
              previewUrl={mobilePreview}
              onUploaded={(path, url) => {
                setMobilePath(path);
                setMobilePreview(url);
              }}
              onRemove={() => { setMobilePath(''); setMobilePreview(null); }}
            />
          </div>

          {/* Right: live preview */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm text-ink dark:text-dark-ink">Live preview</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`btn text-xs py-1 px-2 ${previewMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewMode('desktop')}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={`btn text-xs py-1 px-2 ${previewMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewMode('mobile')}
                >
                  Mobile
                </button>
              </div>
            </div>
            <div className={previewMode === 'mobile' ? 'max-w-[220px]' : 'w-full'}>
              <HeroPreview
                heading={heading}
                subtext={subtext}
                ctaLabel={ctaLabel}
                desktopPreview={desktopPreview}
                mobilePreview={mobilePreview}
                isMobileView={previewMode === 'mobile'}
              />
            </div>
            <p className="text-xs text-muted dark:text-dark-muted">
              {previewMode === 'desktop'
                ? 'Preview approximates the desktop banner. Actual rendering may differ slightly.'
                : 'Preview approximates the mobile banner (portrait).'}
            </p>
          </div>
        </div>
      )}

      {/* Featured products */}
      {type === 'featured' && (
        <div className="border border-line dark:border-dark-line p-4 max-w-sm">
          <p className="text-sm text-muted dark:text-dark-muted mb-3">Pick products to feature.</p>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {products.length === 0 && <p className="text-sm text-muted dark:text-dark-muted">No products available.</p>}
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-ink dark:text-dark-ink">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={() => toggleProduct(p.id)}
                />
                {p.title}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Active toggle */}
      <label className="flex items-center gap-2 text-sm text-ink dark:text-dark-ink">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Show this section on the home page
      </label>

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted dark:text-dark-muted">{msg}</p>}

      <div className="flex items-center gap-4">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : editing ? 'Save changes' : 'Add section'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.push('/admin/homepage')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
