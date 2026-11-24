'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCategory, type CategoryInput } from '@/lib/actions/admin';
import type { Category } from '@/lib/types';

export default function CategoryForm({
  category,
}: {
  category: Category | null;
}) {
  const router = useRouter();
  const editing = Boolean(category);

  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    setErr(null);
    setSaving(true);
    const input: CategoryInput = {
      id: category?.id,
      name,
      slug,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    };
    const res = await saveCategory(input);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    if (!editing) {
      setName('');
      setSlug('');
      setSortOrder(0);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_auto] gap-3 items-end">
        <div className="field">
          <label htmlFor="cat-name">Name</label>
          <input
            id="cat-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cat-slug">Slug (optional)</label>
          <input
            id="cat-slug"
            className="input"
            value={slug}
            placeholder="auto from name"
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cat-order">Order</label>
          <input
            id="cat-order"
            type="number"
            className="input"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving' : editing ? 'Save changes' : 'Add category'}
        </button>
        {err && <span className="text-sm theme-text">{err}</span>}
      </div>
    </div>
  );
}
