'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProduct,
  uploadProductImage,
  removeProductImage,
  type ProductInput,
  type ProductVariantInput,
} from '@/lib/actions/admin';
import type { Category, ProductDetail } from '@/lib/types';
import ProductImage from '@/components/product-image';

export default function ProductForm({
  product,
  categories,
}: {
  product: ProductDetail | null;
  categories: Category[];
}) {
  const router = useRouter();
  const [_, startTransition] = useTransition();
  const editing = Boolean(product);

  const [fields, setFields] = useState({
    title: product?.title ?? '',
    slug: product?.slug ?? '',
    description: product?.description ?? '',
    price: product?.price ?? 0,
    category_id: product?.category_id ?? '',
    has_variants: product?.has_variants ?? false,
    stock: product?.stock ?? 0,
    is_featured: product?.is_featured ?? false,
    is_active: product?.is_active ?? true,
  });

  const [variants, setVariants] = useState<ProductVariantInput[]>(
    (product?.variants ?? []).map((v) => ({
      id: v.id,
      size: v.size ?? '',
      color: v.color ?? '',
      stock: v.stock,
      sku: v.sku ?? '',
    })),
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function update<K extends keyof typeof fields>(k: K, v: (typeof fields)[K]) {
    setFields((prev) => ({ ...prev, [k]: v }));
  }

  function addVariant() {
    setVariants((prev) => [...prev, { size: '', color: '', stock: 0 }]);
  }
  function updateVariant(i: number, patch: Partial<ProductVariantInput>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function removeVariant(i: number) {
    setVariants((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    setSaving(true);
    const input: ProductInput = {
      id: product?.id,
      title: fields.title,
      slug: fields.slug,
      description: fields.description,
      price: Number(fields.price) || 0,
      category_id: fields.category_id || null,
      has_variants: fields.has_variants,
      stock: fields.has_variants ? null : Number(fields.stock) || 0,
      is_featured: fields.is_featured,
      is_active: fields.is_active,
      variants: fields.has_variants ? variants : [],
    };
    const res = await saveProduct(input);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMsg('Saved.');
    if (!editing) {
      router.push(`/admin/products/${res.id}`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !product?.id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('product_id', product.id);
    setErr(null);
    const res = await uploadProductImage(fd);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    startTransition(() => router.refresh());
    e.target.value = '';
  }

  async function onDeleteImage(id: string) {
    await removeProductImage(id);
    startTransition(() => router.refresh());
  }

  const sortedImages = [...(product?.images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 max-w-xl">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            className="input"
            value={fields.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">Slug (optional)</label>
          <input
            id="slug"
            className="input"
            value={fields.slug}
            placeholder="auto-generated from title"
            onChange={(e) => update('slug', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            className="input"
            rows={4}
            value={fields.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="price">Price</label>
            <input
              id="price"
              type="number"
              step="0.01"
              className="input"
              value={fields.price}
              onChange={(e) => update('price', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              className="input"
              value={fields.category_id}
              onChange={(e) => update('category_id', e.target.value)}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.has_variants}
              onChange={(e) => update('has_variants', e.target.checked)}
            />
            Has variants (size / color)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.is_featured}
              onChange={(e) => update('is_featured', e.target.checked)}
            />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.is_active}
              onChange={(e) => update('is_active', e.target.checked)}
            />
            Active
          </label>
        </div>

        {!fields.has_variants && (
          <div className="field max-w-[12rem]">
            <label htmlFor="stock">Stock</label>
            <input
              id="stock"
              type="number"
              className="input"
              value={fields.stock ?? 0}
              onChange={(e) => update('stock', Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {fields.has_variants && (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Variants</h2>
            <button type="button" className="btn btn-ghost text-sm" onClick={addVariant}>
              Add variant
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {variants.length === 0 && (
              <p className="text-sm text-muted">No variants yet. Add at least one.</p>
            )}
            {variants.map((v, i) => (
              <div key={v.id ?? `new-${i}`} className="grid grid-cols-4 gap-2 items-end">
                <div className="field">
                  <label>Size</label>
                  <input
                    className="input"
                    value={v.size ?? ''}
                    onChange={(e) => updateVariant(i, { size: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Color</label>
                  <input
                    className="input"
                    value={v.color ?? ''}
                    onChange={(e) => updateVariant(i, { color: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Stock</label>
                  <input
                    type="number"
                    className="input"
                    value={v.stock}
                    onChange={(e) =>
                      updateVariant(i, { stock: Number(e.target.value) })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => removeVariant(i)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="text-sm text-clay">{err}</p>}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving' : editing ? 'Save changes' : 'Create product'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push('/admin/products')}
        >
          Cancel
        </button>
      </div>

      {editing && (
        <div className="max-w-2xl mt-4">
          <h2 className="font-medium mb-3">Images</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
            {sortedImages.map((img) => (
              <div key={img.id} className="relative border border-line">
                <div className="aspect-square">
                  <ProductImage path={img.storage_path} alt="product image" className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                  onClick={() => onDeleteImage(img.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <label className="btn btn-outline cursor-pointer">
            Upload image
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </label>
        </div>
      )}
    </div>
  );
}
