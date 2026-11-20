'use client';

import { useState, useTransition, useRef, type ChangeEvent } from 'react';
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

const MAX_IMAGES = 5;

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

  // Keep price and stock as strings while the admin types so clearing the
  // field does not instantly snap back to "0". Validated before save.
  const [title, setTitle] = useState(product?.title ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [priceStr, setPriceStr] = useState(
    product?.price != null ? String(product.price) : '',
  );
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [hasVariants, setHasVariants] = useState(product?.has_variants ?? false);
  const [stockStr, setStockStr] = useState(
    product?.stock != null ? String(product.stock) : '',
  );
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  const [variants, setVariants] = useState<ProductVariantInput[]>(
    (product?.variants ?? []).map((v) => ({
      id: v.id,
      size: v.size ?? '',
      color: v.color ?? '',
      stock: v.stock,
      sku: v.sku ?? '',
    })),
  );

  // Pending image files chosen before the product exists
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addVariant() {
    setVariants((prev) => [...prev, { size: '', color: '', stock: 0 }]);
  }
  function updateVariant(i: number, patch: Partial<ProductVariantInput>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function removeVariant(i: number) {
    setVariants((prev) => prev.filter((_, idx) => idx !== i));
  }

  const sortedImages = [...(product?.images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const totalImages = sortedImages.length + pendingFiles.length;

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;
    setErr(null);

    if (editing) {
      // Product already exists: upload immediately
      uploadFiles(chosen, product!.id);
    } else {
      // New product: queue until after first save
      const remaining = MAX_IMAGES - totalImages;
      if (remaining <= 0) {
        setErr(`Maximum ${MAX_IMAGES} images allowed.`);
        e.target.value = '';
        return;
      }
      const toAdd = chosen.slice(0, remaining);
      if (toAdd.length < chosen.length) {
        setErr(`Only ${remaining} more image(s) can be added (max ${MAX_IMAGES}).`);
      }
      setPendingFiles((prev) => [...prev, ...toAdd]);
    }
    e.target.value = '';
  }

  async function uploadFiles(files: File[], productId: string) {
    setUploading(true);
    setErr(null);
    for (const file of files) {
      const { count } = await (async () => {
        // Count existing images for this product to stay within the limit
        const existing = sortedImages.length;
        return { count: existing };
      })();
      if (count >= MAX_IMAGES) {
        setErr(`Maximum ${MAX_IMAGES} images allowed.`);
        break;
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('product_id', productId);
      const res = await uploadProductImage(fd);
      if (!res.ok) {
        setErr(res.error);
        break;
      }
    }
    setUploading(false);
    startTransition(() => router.refresh());
  }

  async function onDeleteImage(id: string) {
    await removeProductImage(id);
    startTransition(() => router.refresh());
  }

  function removePending(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSave() {
    setErr(null);
    setMsg(null);

    // --- Validation ---
    if (!title.trim()) {
      setErr('Title is required.');
      return;
    }
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      setErr('Price must be a number of 0 or more.');
      return;
    }
    let stock: number | null = null;
    if (!hasVariants) {
      stock = parseInt(stockStr, 10);
      if (isNaN(stock) || stock < 0) {
        setErr('Stock must be a whole number of 0 or more.');
        return;
      }
    }

    setSaving(true);
    const input: ProductInput = {
      id: product?.id,
      title: title.trim(),
      slug,
      description,
      price,
      category_id: categoryId || null,
      has_variants: hasVariants,
      stock: hasVariants ? null : stock,
      is_featured: isFeatured,
      is_active: isActive,
      variants: hasVariants ? variants : [],
    };
    const res = await saveProduct(input);
    setSaving(false);

    if (!res.ok) {
      setErr(res.error);
      return;
    }

    // Upload any queued images now that we have a product id
    if (!editing && pendingFiles.length > 0) {
      setUploading(true);
      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('product_id', res.id);
        const imgRes = await uploadProductImage(fd);
        if (!imgRes.ok) {
          setErr(`Image upload failed: ${imgRes.error}`);
          break;
        }
      }
      setUploading(false);
      setPendingFiles([]);
    }

    setMsg('Saved.');
    if (!editing) {
      router.push(`/admin/products/${res.id}`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  const canAddMore = totalImages < MAX_IMAGES;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 max-w-xl">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">Slug (optional)</label>
          <input
            id="slug"
            className="input"
            value={slug}
            placeholder="auto-generated from title"
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            className="input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="price">Price</label>
            <input
              id="price"
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
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
              checked={hasVariants}
              onChange={(e) => setHasVariants(e.target.checked)}
            />
            Has variants (size / color)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        </div>

        {!hasVariants && (
          <div className="field max-w-[12rem]">
            <label htmlFor="stock">Stock</label>
            <input
              id="stock"
              type="number"
              min="0"
              step="1"
              className="input"
              value={stockStr}
              onChange={(e) => setStockStr(e.target.value)}
              placeholder="0"
            />
          </div>
        )}
      </div>

      {hasVariants && (
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
                    min="0"
                    step="1"
                    className="input"
                    value={v.stock}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      updateVariant(i, { stock: isNaN(n) || n < 0 ? 0 : n });
                    }}
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

      {/* Images — available both on new and edit forms */}
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">
            Images
            <span className="text-sm font-normal text-muted ml-2">
              {totalImages}/{MAX_IMAGES}
            </span>
          </h2>
        </div>

        {/* Already-saved images (edit mode) */}
        {sortedImages.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            {sortedImages.map((img) => (
              <div key={img.id} className="relative border border-line">
                <div className="aspect-square">
                  <ProductImage
                    path={img.storage_path}
                    alt="product image"
                    className="w-full h-full object-cover"
                  />
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
        )}

        {/* Pending files preview (new product, before first save) */}
        {pendingFiles.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            {pendingFiles.map((file, i) => (
              <div key={i} className="relative border border-line border-dashed">
                <div className="aspect-square bg-clay-tint flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                  onClick={() => removePending(i)}
                >
                  Remove
                </button>
                <p className="text-xs text-muted px-1 pb-1 truncate">Queued</p>
              </div>
            ))}
          </div>
        )}

        {canAddMore && (
          <label className={`btn btn-outline cursor-pointer ${uploading ? 'opacity-60' : ''}`}>
            {uploading ? 'Uploading...' : `Add image${MAX_IMAGES - totalImages > 1 ? 's' : ''} (${MAX_IMAGES - totalImages} remaining)`}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPickFiles}
              disabled={uploading}
            />
          </label>
        )}
        {!canAddMore && (
          <p className="text-sm text-muted">Maximum {MAX_IMAGES} images reached.</p>
        )}
        {!editing && pendingFiles.length > 0 && (
          <p className="text-xs text-muted mt-2">
            Images will be uploaded when you click Save.
          </p>
        )}
      </div>

      {err && <p className="text-sm text-clay">{err}</p>}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving || uploading}
        >
          {saving ? 'Saving' : uploading ? 'Uploading images' : editing ? 'Save changes' : 'Create product'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push('/admin/products')}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
