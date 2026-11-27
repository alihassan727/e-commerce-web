'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveHomepageSection, type HomepageSectionInput } from '@/lib/actions/admin';
import type { Category, CategoryBoxItem, HomepageSection, HomepageSectionType } from '@/lib/types';
import { getHeroImageUrl } from '@/lib/storage';
import { compressImage } from '@/lib/image-compress';

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
): Promise<{ url: string; path: string } | { error: string }> {
  // Uploads go through the admin server action; the service-role key never
  // reaches the browser.
  const { adminUploadCmsAsset } = await import('@/lib/actions/account');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('field', `hero-${slot}`);
  const result = await adminUploadCmsAsset(fd);
  if (!result.ok) return { error: result.error };
  return { url: result.url, path: result.url.split('/cms-assets/')[1] ?? '' };
}

// ---------------------------------------------------------------------------
// Hero image uploader subcomponent
// ---------------------------------------------------------------------------
function HeroImageUploader({
  slot,
  label,
  dimensionHint,
  previewUrl,
  onUploaded,
  onRemove,
}: {
  slot: 'desktop' | 'mobile';
  label: string;
  dimensionHint: string;
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

    // Measure dimensions before compressing/uploading.
    const img = new Image();
    img.src = localUrl;
    await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
    const warning = ratioWarning(
      img.naturalWidth,
      img.naturalHeight,
      slot === 'desktop' ? DESKTOP_RATIO : MOBILE_RATIO,
    );
    URL.revokeObjectURL(localUrl);

    setUploading(true);
    const compressed = await compressImage(file, {
      maxWidth: slot === 'desktop' ? 1920 : 1080,
      maxHeight: slot === 'desktop' ? 1080 : 1400,
      quality: 0.85,
    });
    const result = await uploadHeroImage(compressed, slot);
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
type SectionMode = 'hero' | 'category' | 'featured' | 'category_boxes';

function buildInitialBoxItems(
  categories: Category[],
  existing: CategoryBoxItem[] | undefined,
): CategoryBoxItem[] {
  const byId = new Map((existing ?? []).map((it) => [it.category_id, it]));
  const ordered: CategoryBoxItem[] = [];
  // Keep existing ordered items that still exist
  for (const it of [...(existing ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
    if (categories.some((c) => c.id === it.category_id)) {
      ordered.push({ ...it });
    }
  }
  // Append any new categories not yet in the list
  for (const c of categories) {
    if (!byId.has(c.id)) {
      ordered.push({
        category_id: c.id,
        title: '',
        image_path: '',
        is_active: true,
        sort_order: ordered.length,
      });
    }
  }
  return ordered.map((it, idx) => ({ ...it, sort_order: idx }));
}

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
  const initialMode: SectionMode =
    section?.type === 'category' && cfg.kind === 'category_boxes'
      ? 'category_boxes'
      : (section?.type ?? 'hero');

  const [mode, setMode] = useState<SectionMode>(initialMode);
  const type: HomepageSectionType = mode === 'category_boxes' ? 'category' : mode;
  const [title, setTitle] = useState(section?.title ?? '');
  const [sectionDescription, setSectionDescription] = useState<string>(
    (cfg.description as string) ?? '',
  );
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
  const [featuredCtaLabel, setFeaturedCtaLabel] = useState<string>(
    (cfg.cta_label as string) ?? '',
  );
  const [featuredCtaHref, setFeaturedCtaHref] = useState<string>(
    (cfg.cta_href as string) ?? '',
  );

  // Category boxes
  const [boxItems, setBoxItems] = useState<CategoryBoxItem[]>(() =>
    buildInitialBoxItems(
      categories,
      Array.isArray(cfg.items) ? (cfg.items as CategoryBoxItem[]) : undefined,
    ),
  );
  const [uploadingBoxId, setUploadingBoxId] = useState<string | null>(null);

  // Preview mode
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleProduct(id: string) {
    setProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function updateBoxItem(categoryIdToUpdate: string, patch: Partial<CategoryBoxItem>) {
    setBoxItems((prev) =>
      prev.map((it) => (it.category_id === categoryIdToUpdate ? { ...it, ...patch } : it)),
    );
  }

  function moveBoxItem(index: number, dir: -1 | 1) {
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= boxItems.length) return;
    setBoxItems((prev) => {
      const next = prev.slice();
      const tmp = next[index];
      next[index] = next[swapIdx];
      next[swapIdx] = tmp;
      return next.map((it, idx) => ({ ...it, sort_order: idx }));
    });
  }

  async function onUploadBoxImage(catId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    setUploadingBoxId(catId);
    const compressed = await compressImage(file, { maxWidth: 1000, maxHeight: 1250, quality: 0.84 });
    const { adminUploadCmsAsset } = await import('@/lib/actions/account');
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('field', `category-${catId}`);
    const res = await adminUploadCmsAsset(fd);
    setUploadingBoxId(null);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    const relPath = res.url.split('/cms-assets/')[1] ?? res.url;
    updateBoxItem(catId, { image_path: relPath });
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (mode === 'hero') {
      config.heading = heading;
      config.subtext = subtext;
      config.cta_label = ctaLabel;
      config.cta_href = ctaHref;
      if (desktopPath) config.desktop_image_path = desktopPath;
      if (mobilePath) config.mobile_image_path = mobilePath;
    } else if (mode === 'featured') {
      config.product_ids = productIds;
      if (sectionDescription.trim()) config.description = sectionDescription.trim();
      if (featuredCtaLabel.trim()) config.cta_label = featuredCtaLabel.trim();
      if (featuredCtaHref.trim()) config.cta_href = featuredCtaHref.trim();
    } else if (mode === 'category') {
      if (sectionDescription.trim()) config.description = sectionDescription.trim();
    } else if (mode === 'category_boxes') {
      config.kind = 'category_boxes';
      if (sectionDescription.trim()) config.description = sectionDescription.trim();
      config.items = boxItems.map((it, idx) => ({
        category_id: it.category_id,
        title: it.title?.trim() || undefined,
        image_path: it.image_path?.trim() || undefined,
        is_active: it.is_active,
        sort_order: idx,
      }));
    }

    const input: HomepageSectionInput = {
      id: section?.id,
      type,
      title: title || null,
      category_id: mode === 'category' ? categoryId || null : null,
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
          value={mode}
          onChange={(e) => setMode(e.target.value as SectionMode)}
          disabled={editing}
        >
          <option value="hero">Hero banner</option>
          <option value="category">Category product showcase</option>
          <option value="featured">Featured products / New arrivals</option>
          <option value="category_boxes">Category boxes grid</option>
        </select>
      </div>

      {/* Title */}
      <div className="field max-w-md">
        <label htmlFor="hs-title">Section heading (optional)</label>
        <input
          id="hs-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            mode === 'category_boxes'
              ? 'Shop by Category'
              : mode === 'featured'
                ? 'Featured Collection'
                : ''
          }
        />
      </div>

      {/* Optional description for non-hero sections */}
      {mode !== 'hero' && (
        <div className="field max-w-md">
          <label htmlFor="hs-desc">Section description (optional)</label>
          <input
            id="hs-desc"
            className="input"
            value={sectionDescription}
            onChange={(e) => setSectionDescription(e.target.value)}
            placeholder="Short editorial subtitle shown below the heading"
          />
        </div>
      )}

      {/* Category picker */}
      {mode === 'category' && (
        <div className="field max-w-xs">
          <label htmlFor="hs-category">Category</label>
          <select id="hs-category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Hero editor + preview */}
      {mode === 'hero' && (
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
      {mode === 'featured' && (
        <div className="flex flex-col gap-4 max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="hs-feat-cta-label">Link label (optional)</label>
              <input
                id="hs-feat-cta-label"
                className="input"
                value={featuredCtaLabel}
                onChange={(e) => setFeaturedCtaLabel(e.target.value)}
                placeholder="Shop all"
              />
            </div>
            <div className="field">
              <label htmlFor="hs-feat-cta-href">Link URL (optional)</label>
              <input
                id="hs-feat-cta-href"
                className="input"
                value={featuredCtaHref}
                onChange={(e) => setFeaturedCtaHref(e.target.value)}
                placeholder="/shop"
              />
            </div>
          </div>
          <div className="border border-line dark:border-dark-line rounded-md p-4">
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
        </div>
      )}

      {/* Category boxes manager */}
      {mode === 'category_boxes' && (
        <div className="border border-line dark:border-dark-line rounded-md p-4">
          <p className="font-medium text-sm text-ink dark:text-dark-ink mb-1">Category boxes</p>
          <p className="text-xs text-muted dark:text-dark-muted mb-4">
            Choose which categories appear, reorder them, customize their displayed title, or upload a custom cover image.
            If no custom image is uploaded, a product image from that category is used automatically.
          </p>
          {boxItems.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-muted">No active categories found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {boxItems.map((item, idx) => {
                const cat = categories.find((c) => c.id === item.category_id);
                if (!cat) return null;
                const preview = item.image_path ? getHeroImageUrl(item.image_path) : null;
                return (
                  <div
                    key={item.category_id}
                    className="flex flex-col md:flex-row md:items-center gap-3 p-3 border border-line dark:border-dark-line rounded-md"
                  >
                    <div className="flex items-center gap-3 min-w-[10rem]">
                      <input
                        type="checkbox"
                        checked={item.is_active}
                        onChange={(e) => updateBoxItem(item.category_id, { is_active: e.target.checked })}
                        aria-label={`Show ${cat.name}`}
                      />
                      <div>
                        <p className="text-sm font-medium text-ink dark:text-dark-ink">{cat.name}</p>
                        <p className="text-xs text-muted dark:text-dark-muted">/{cat.slug}</p>
                      </div>
                    </div>

                    <div className="flex-1">
                      <input
                        className="input text-sm"
                        value={item.title ?? ''}
                        onChange={(e) => updateBoxItem(item.category_id, { title: e.target.value })}
                        placeholder={`Display title (default: ${cat.name})`}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      {preview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview}
                          alt={cat.name}
                          className="w-10 h-12 object-cover rounded border border-line dark:border-dark-line"
                        />
                      )}
                      <label className="btn btn-ghost text-xs py-1 px-2.5 cursor-pointer">
                        {uploadingBoxId === item.category_id ? 'Uploading...' : preview ? 'Change img' : 'Upload img'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingBoxId === item.category_id}
                          onChange={(e) => onUploadBoxImage(item.category_id, e)}
                        />
                      </label>
                      {preview && (
                        <button
                          type="button"
                          className="text-xs text-muted dark:text-dark-muted"
                          onClick={() => updateBoxItem(item.category_id, { image_path: '' })}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        disabled={idx === 0}
                        className="theme-text disabled:opacity-40"
                        onClick={() => moveBoxItem(idx, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={idx === boxItems.length - 1}
                        className="theme-text disabled:opacity-40"
                        onClick={() => moveBoxItem(idx, 1)}
                      >
                        Down
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
