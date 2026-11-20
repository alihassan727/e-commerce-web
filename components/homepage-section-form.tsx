'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveHomepageSection, type HomepageSectionInput } from '@/lib/actions/admin';
import type { Category, HomepageSection, HomepageSectionType } from '@/lib/types';

interface ProductLite {
  id: string;
  title: string;
  is_active: boolean;
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
  const [type, setType] = useState<HomepageSectionType>(section?.type ?? 'hero');
  const [title, setTitle] = useState(section?.title ?? '');
  const [categoryId, setCategoryId] = useState(section?.category_id ?? '');
  const [isActive, setIsActive] = useState(section?.is_active ?? true);

  const [heading, setHeading] = useState<string>((cfg.heading as string) ?? '');
  const [subtext, setSubtext] = useState<string>((cfg.subtext as string) ?? '');
  const [ctaLabel, setCtaLabel] = useState<string>((cfg.cta_label as string) ?? '');
  const [ctaHref, setCtaHref] = useState<string>((cfg.cta_href as string) ?? '');
  const [imagePath, setImagePath] = useState<string>((cfg.image_path as string) ?? '');

  const initialIds = Array.isArray(cfg.product_ids)
    ? (cfg.product_ids as string[])
    : [];
  const [productIds, setProductIds] = useState<string[]>(initialIds);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleProduct(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSave() {
    setErr(null);
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (type === 'hero') {
      config.heading = heading;
      config.subtext = subtext;
      config.cta_label = ctaLabel;
      config.cta_href = ctaHref;
      if (imagePath) config.image_path = imagePath;
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
    if (!editing) router.push(`/admin/homepage/${res.id}`);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="field">
        <label htmlFor="hs-type">Section type</label>
        <select
          id="hs-type"
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as HomepageSectionType)}
          disabled={editing}
        >
          <option value="hero">Hero</option>
          <option value="category">Category</option>
          <option value="featured">Featured products</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="hs-title">Title (optional)</label>
        <input
          id="hs-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {type === 'category' && (
        <div className="field">
          <label htmlFor="hs-category">Category</label>
          <select
            id="hs-category"
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === 'hero' && (
        <div className="flex flex-col gap-4 border border-line p-4">
          <div className="field">
            <label htmlFor="hs-heading">Heading</label>
            <input id="hs-heading" className="input" value={heading} onChange={(e) => setHeading(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hs-subtext">Subtext</label>
            <textarea id="hs-subtext" className="input" rows={2} value={subtext} onChange={(e) => setSubtext(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="field">
              <label htmlFor="hs-cta-label">Button label</label>
              <input id="hs-cta-label" className="input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hs-cta-href">Button link</label>
              <input id="hs-cta-href" className="input" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/shop" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="hs-image">Hero image storage path (optional)</label>
            <input id="hs-image" className="input" value={imagePath} onChange={(e) => setImagePath(e.target.value)} placeholder="seed/hero.jpg" />
          </div>
        </div>
      )}

      {type === 'featured' && (
        <div className="border border-line p-4">
          <p className="text-sm text-muted mb-3">Pick products to feature.</p>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {products.length === 0 && <p className="text-sm text-muted">No products available.</p>}
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Show this section on the home page
      </label>

      {err && <p className="text-sm text-clay">{err}</p>}

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
