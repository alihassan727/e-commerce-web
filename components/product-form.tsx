'use client';

import { useEffect, useState, useTransition, useRef, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProduct,
  uploadColorImage,
  uploadProductImage,
  removeColorImage,
  removeProductImage,
  type ProductInput,
} from '@/lib/actions/admin';
import type { Category, ColorImage, ProductDetail, ProductImage as ProductImageType } from '@/lib/types';
import ProductImage from '@/components/product-image';
import { compressImages } from '@/lib/image-compress';

const MAX_IMAGES = 5;

interface SizeState {
  id?: string;
  size: string;
  stock: number;
  sku: string;
  active: boolean;
}

interface PendingImage {
  key: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface ColorState {
  key: string;
  id?: string;
  name: string;
  colorHex: string;
  title: string;
  sku: string;
  regularPrice: string;
  salePrice: string;
  isActive: boolean;
  sizes: SizeState[];
  images: ColorImage[];
  pendingFiles: PendingImage[];
}

function newKey(): string {
  return `k_${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable client-generated UUID for a new product, reused across retries. */
function generateProductId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function blankSize(): SizeState {
  return { size: '', stock: 0, sku: '', active: true };
}
function blankColor(regularPrice = ''): ColorState {
  return {
    key: newKey(),
    name: '',
    colorHex: '',
    title: '',
    sku: '',
    regularPrice,
    salePrice: '',
    isActive: true,
    sizes: [blankSize()],
    images: [],
    pendingFiles: [],
  };
}

function cloneColors(colors: ColorState[]): ColorState[] {
  return colors.map((c) => ({
    ...c,
    sizes: c.sizes.map((s) => ({ ...s })),
    images: [...c.images],
    pendingFiles: c.pendingFiles.map((p) => ({ ...p })),
  }));
}

/** Builds editable color state from a saved product, keeping legacy variants. */
function initColors(product: ProductDetail | null): ColorState[] {
  if (!product) return [];
  const variants = product.variants ?? [];
  const colors = product.colors ?? [];
  const used = new Set<string>();

  const states: ColorState[] = colors.map((c) => {
    const sizes = variants
      .filter(
        (v) =>
          v.color_id === c.id ||
          (!v.color_id &&
            v.color &&
            v.color.trim().toLowerCase() === c.name.trim().toLowerCase()),
      )
      .map((v) => {
        used.add(v.id);
        return {
          id: v.id,
          size: v.size ?? '',
          stock: v.stock,
          sku: v.sku ?? '',
          active: v.is_active,
        };
      });
    return {
      key: newKey(),
      id: c.id,
      name: c.name,
      colorHex: c.color_hex ?? '',
      title: c.title ?? '',
      sku: c.sku ?? '',
      regularPrice: c.regular_price != null ? String(c.regular_price) : '',
      salePrice: c.sale_price != null ? String(c.sale_price) : '',
      isActive: c.is_active,
      sizes: sizes.length ? sizes : [blankSize()],
      images: [...(c.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      pendingFiles: [],
    };
  });

  // Legacy variants not linked to any color: surface them as a synthetic color
  // so they are visible/editable and preserved on save.
  const unmatched = variants.filter((v) => !used.has(v.id));
  if (unmatched.length > 0) {
    const name = unmatched[0].color?.trim() || 'Default';
    states.push({
      key: newKey(),
      name,
      colorHex: unmatched[0].color_hex ?? '',
      title: '',
      sku: '',
      regularPrice: product.price != null ? String(product.price) : '',
      salePrice: '',
      isActive: true,
      sizes: unmatched.map((v) => ({
        id: v.id,
        size: v.size ?? '',
        stock: v.stock,
        sku: v.sku ?? '',
        active: v.is_active,
      })),
      images: [],
      pendingFiles: [],
    });
  }

  return states;
}

/**
 * Shows a local File preview. The object URL is created in an effect and
 * revoked on unmount/change so repeated renders do not leak blob URLs.
 */
function LocalImagePreview({
  file,
  alt,
  className,
}: {
  file: File;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} />
  );
}

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

  const [colors, setColors] = useState<ColorState[]>(() => initColors(product));

  // Product-level images (simple products only).
  const [productImages, setProductImages] = useState<ProductImageType[]>(
    () => product?.images ?? [],
  );
  const [pendingProductFiles, setPendingProductFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Persist the saved product/color ids so a retry after a partial image
  // upload updates the same product instead of creating a duplicate.
  const [savedProductId, setSavedProductId] = useState<string | null>(
    product?.id ?? null,
  );
  // Stable id for a brand-new product, generated once and reused on every retry
  // so a partial save can never create a duplicate product.
  const [newProductId] = useState<string>(() => generateProductId());
  const [savedColorIds, setSavedColorIds] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  // ---- color helpers ----
  function addColor() {
    setColors((prev) => [...prev, blankColor(priceStr)]);
  }
  function updateColor(i: number, patch: Partial<ColorState>) {
    setColors((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeColor(i: number) {
    setColors((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addSize(ci: number) {
    setColors((prev) =>
      prev.map((c, idx) =>
        idx === ci ? { ...c, sizes: [...c.sizes, blankSize()] } : c,
      ),
    );
  }
  function updateSize(ci: number, si: number, patch: Partial<SizeState>) {
    setColors((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? {
              ...c,
              sizes: c.sizes.map((s, sIdx) =>
                sIdx === si ? { ...s, ...patch } : s,
              ),
            }
          : c,
      ),
    );
  }
  function removeSize(ci: number, si: number) {
    setColors((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, sizes: c.sizes.filter((_, sIdx) => sIdx !== si) }
          : c,
      ),
    );
  }

  async function onPickColorFiles(ci: number, e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (chosen.length === 0) return;
    setErr(null);

    const target = colors[ci];
    if (!target) return;
    const remaining = MAX_IMAGES - target.images.length - target.pendingFiles.length;
    if (remaining <= 0) {
      setErr(`Maximum ${MAX_IMAGES} images per color.`);
      return;
    }
    const toAdd = chosen.slice(0, remaining);
    if (toAdd.length < chosen.length) {
      setErr(`Only ${remaining} more image(s) can be added per color.`);
    }

    setCompressing(true);
    try {
      const compressed = await compressImages(toAdd, { maxWidth: 1600, maxHeight: 2000, quality: 0.84 });
      const pending: PendingImage[] = compressed.map((file) => ({
        key: newKey(),
        file,
        status: 'queued',
      }));

      setColors((prev) =>
        prev.map((c, idx) =>
          idx === ci ? { ...c, pendingFiles: [...c.pendingFiles, ...pending] } : c,
        ),
      );
    } finally {
      setCompressing(false);
    }
  }

  function removePendingColorFile(ci: number, fi: number) {
    setColors((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, pendingFiles: c.pendingFiles.filter((_, f) => f !== fi) }
          : c,
      ),
    );
  }

  async function onDeleteColorImage(ci: number, imageId: string) {
    await removeColorImage(imageId);
    setColors((prev) =>
      prev.map((c, idx) =>
        idx === ci
          ? { ...c, images: c.images.filter((im) => im.id !== imageId) }
          : c,
      ),
    );
    startTransition(() => router.refresh());
  }

  async function onPickProductFiles(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (chosen.length === 0) return;
    setErr(null);
    const remaining = MAX_IMAGES - productImages.length - pendingProductFiles.length;
    if (remaining <= 0) {
      setErr(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }
    const toAdd = chosen.slice(0, remaining);
    if (toAdd.length < chosen.length) {
      setErr(`Only ${remaining} more image(s) can be added.`);
    }
    setCompressing(true);
    try {
      const compressed = await compressImages(toAdd, { maxWidth: 1600, maxHeight: 2000, quality: 0.84 });
      setPendingProductFiles((prev) => [...prev, ...compressed]);
    } finally {
      setCompressing(false);
    }
  }

  async function onDeleteProductImage(id: string) {
    await removeProductImage(id);
    // Drop it from local state too; router.refresh() does not re-initialise
    // useState initial values, so the thumbnail would otherwise linger.
    setProductImages((prev) => prev.filter((img) => img.id !== id));
    startTransition(() => router.refresh());
  }

  async function onSave() {
    setErr(null);
    setMsg(null);

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
    } else {
      if (colors.length === 0) {
        setErr('Add at least one color.');
        return;
      }
      for (const c of colors) {
        if (!c.name.trim()) {
          setErr('Every color needs a name.');
          return;
        }
        const regular = parseFloat(c.regularPrice);
        if (isNaN(regular) || regular < 0) {
          setErr(`Regular price for ${c.name} must be 0 or more.`);
          return;
        }
        if (c.salePrice.trim() !== '') {
          const sale = parseFloat(c.salePrice);
          if (isNaN(sale) || sale <= 0 || sale >= regular) {
            setErr(`Sale price for ${c.name} must be positive and lower than the regular price.`);
            return;
          }
        }
        const namedSizes = c.sizes.filter((s) => s.size.trim() !== '');
        if (namedSizes.length === 0) {
          setErr(`Add at least one size for ${c.name}.`);
          return;
        }
      }
    }

    setSaving(true);
    const existingId = product?.id ?? savedProductId ?? newProductId;
    const input: ProductInput = {
      id: existingId,
      title: title.trim(),
      slug,
      description,
      price,
      category_id: categoryId || null,
      has_variants: hasVariants,
      stock: hasVariants ? null : stock,
      is_featured: isFeatured,
      is_active: isActive,
      colors: hasVariants
        ? colors.map((c) => ({
            key: c.key,
            id: c.id ?? savedColorIds[c.key],
            name: c.name.trim(),
            color_hex: c.colorHex.trim() || undefined,
            title: c.title.trim() || undefined,
            sku: c.sku.trim() || undefined,
            regular_price: parseFloat(c.regularPrice) || 0,
            sale_price: c.salePrice.trim() !== '' ? parseFloat(c.salePrice) : null,
            is_active: c.isActive,
            sizes: c.sizes
              .filter((s) => s.size.trim() !== '')
              .map((s) => ({
                id: s.id,
                size: s.size.trim(),
                stock: Math.max(0, Math.floor(Number(s.stock) || 0)),
                sku: s.sku.trim() || undefined,
                is_active: s.active,
              })),
          }))
        : [],
    };
    const res = await saveProduct(input);
    setSaving(false);

    if (!res.ok) {
      // Retain the product id on partial failure so the retry updates the same
      // product instead of inserting a duplicate.
      if (res.id) setSavedProductId(res.id);
      setErr(res.error);
      return;
    }
    setSavedProductId(res.id);
    setSavedColorIds(res.colorIds);

    let anyError = false;

    if (hasVariants) {
      // Upload sequentially, tracking per-image status. Successful images are
      // marked done and never retried; failed ones stay queued for the next
      // Save (which updates the same product/colors, never duplicates).
      const working = cloneColors(colors);
      setUploading(true);
      for (const c of working) {
        const colorId = res.colorIds[c.key];
        if (!colorId) continue;
        for (const p of c.pendingFiles) {
          if (p.status === 'done' || p.status === 'uploading') continue;
          p.status = 'uploading';
          setColors(cloneColors(working));
          const fd = new FormData();
          fd.append('file', p.file);
          fd.append('color_id', colorId);
          const r = await uploadColorImage(fd);
          if (r.ok) {
            p.status = 'done';
            // Show the uploaded image immediately (refetch alone does not
            // re-initialise this component's local image state).
            c.images.push({
              id: r.image.id,
              color_id: colorId,
              storage_path: r.image.storage_path,
              sort_order: r.image.sort_order,
            });
          } else {
            p.status = 'error';
            p.error = r.error;
            anyError = true;
          }
          setColors(cloneColors(working));
        }
      }
      setUploading(false);
      if (anyError) {
        setErr(
          'Some images failed to upload. Click Save to retry only the failed images.',
        );
        return;
      }
      // Drop completed pending entries; uploaded images are already in c.images.
      setColors(
        cloneColors(working).map((c) => ({
          ...c,
          pendingFiles: c.pendingFiles.filter((p) => p.status !== 'done'),
        })),
      );
    } else if (pendingProductFiles.length > 0) {
      setUploading(true);
      const remainingFiles: File[] = [];
      for (const file of pendingProductFiles) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('product_id', res.id);
        const imgRes = await uploadProductImage(fd);
        if (imgRes.ok) {
          setProductImages((prev) => [
            ...prev,
            {
              id: imgRes.image.id,
              product_id: res.id,
              variant_id: null,
              storage_path: imgRes.image.storage_path,
              sort_order: imgRes.image.sort_order,
            },
          ]);
        } else {
          remainingFiles.push(file);
          anyError = true;
          setErr(`Image upload failed: ${imgRes.error}`);
        }
      }
      setUploading(false);
      setPendingProductFiles(remainingFiles);
      if (anyError) return;
    }

    setMsg('Saved.');
    if (!editing) {
      router.push(`/admin/products/${res.id}`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  const totalProductImages = productImages.length + pendingProductFiles.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 max-w-xl">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <label htmlFor="price">Base price</label>
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

        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => setHasVariants(e.target.checked)}
            />
            Has color variants
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
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
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between max-w-2xl">
            <h2 className="font-medium">Colors</h2>
            <button type="button" className="btn btn-ghost text-sm" onClick={addColor}>
              Add color
            </button>
          </div>

          {colors.length === 0 && (
            <p className="text-sm text-muted">No colors yet. Add at least one.</p>
          )}

          {colors.map((c, ci) => {
            const totalColorImages =
              c.images.length + c.pendingFiles.filter((p) => p.status !== 'done').length;
            return (
              <div key={c.key} className="border border-line dark:border-dark-line p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-5 h-5 border border-line dark:border-dark-line"
                      style={{ backgroundColor: c.colorHex || 'transparent' }}
                      aria-hidden="true"
                    />
                    <h3 className="font-medium">{c.name || 'New color'}</h3>
                  </div>
                  <button type="button" className="text-sm text-muted" onClick={() => removeColor(ci)}>
                    Remove color
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
                  <div className="field">
                    <label>Color name</label>
                    <input
                      className="input"
                      value={c.name}
                      onChange={(e) => updateColor(ci, { name: e.target.value })}
                      placeholder="e.g. Black"
                    />
                  </div>
                  <div className="field">
                    <label>Color swatch (hex)</label>
                    <input
                      className="input"
                      value={c.colorHex}
                      onChange={(e) => updateColor(ci, { colorHex: e.target.value })}
                      placeholder="#000000"
                    />
                  </div>
                  <div className="field">
                    <label>Color SKU (optional)</label>
                    <input
                      className="input"
                      value={c.sku}
                      onChange={(e) => updateColor(ci, { sku: e.target.value })}
                      placeholder="optional"
                    />
                  </div>
                  <div className="field">
                    <label>Regular price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={c.regularPrice}
                      onChange={(e) => updateColor(ci, { regularPrice: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="field">
                    <label>Sale price (optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={c.salePrice}
                      onChange={(e) => updateColor(ci, { salePrice: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="field">
                    <label>Color title (optional)</label>
                    <input
                      className="input"
                      value={c.title}
                      onChange={(e) => updateColor(ci, { title: e.target.value })}
                      placeholder="overrides product title"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.isActive}
                    onChange={(e) => updateColor(ci, { isActive: e.target.checked })}
                  />
                  Active
                </label>

                {/* Sizes + stock */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Sizes &amp; stock</p>
                    <button type="button" className="text-sm theme-text" onClick={() => addSize(ci)}>
                      Add size
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {c.sizes.map((s, si) => (
                      <div key={s.id ?? `new-${si}`} className="grid grid-cols-[1fr_6rem_1fr_auto_auto] gap-2 items-end">
                        <div className="field">
                          <label>Size</label>
                          <input
                            className="input"
                            value={s.size}
                            onChange={(e) => updateSize(ci, si, { size: e.target.value })}
                            placeholder="S / M / L"
                          />
                        </div>
                        <div className="field">
                          <label>Stock</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="input"
                            value={s.stock}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              updateSize(ci, si, { stock: isNaN(n) || n < 0 ? 0 : n });
                            }}
                          />
                        </div>
                        <div className="field">
                          <label>Size SKU (optional)</label>
                          <input
                            className="input"
                            value={s.sku}
                            onChange={(e) => updateSize(ci, si, { sku: e.target.value })}
                            placeholder="optional"
                          />
                        </div>
                        <label className="flex items-center gap-1 text-xs pb-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={s.active}
                            onChange={(e) => updateSize(ci, si, { active: e.target.checked })}
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost text-sm"
                          onClick={() => removeSize(ci, si)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Images */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      Images{' '}
                      <span className="text-xs font-normal text-muted">
                        {totalColorImages}/{MAX_IMAGES}
                      </span>
                    </p>
                  </div>
                  {(c.images.length > 0 || c.pendingFiles.length > 0) && (
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-3">
                      {c.images.map((img) => (
                        <div key={img.id} className="relative border border-line dark:border-dark-line">
                          <div className="aspect-square">
                            <ProductImage
                              path={img.storage_path}
                              alt={c.name || 'color image'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                            onClick={() => onDeleteColorImage(ci, img.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {c.pendingFiles.map((p, fi) => (
                        <div key={p.key} className="relative border border-line border-dashed">
                          <div className="aspect-square theme-tint flex items-center justify-center overflow-hidden">
                            <LocalImagePreview
                              file={p.file}
                              alt={p.file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {p.status !== 'done' && (
                            <button
                              type="button"
                              className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                              onClick={() => removePendingColorFile(ci, fi)}
                            >
                              Remove
                            </button>
                          )}
                          <p
                            className={`text-xs px-1 pb-1 truncate ${
                              p.status === 'error' ? 'theme-text' : 'text-muted'
                            }`}
                          >
                            {p.status === 'queued'
                              ? 'Queued'
                              : p.status === 'uploading'
                                ? 'Uploading…'
                                : p.status === 'done'
                                  ? 'Uploaded'
                                  : `Failed: ${p.error ?? 'error'}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {totalColorImages < MAX_IMAGES && (
                    <label className={`btn btn-outline cursor-pointer ${uploading ? 'opacity-60' : ''}`}>
                      {uploading ? 'Uploading...' : `Add image${MAX_IMAGES - totalColorImages > 1 ? 's' : ''}`}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => onPickColorFiles(ci, e)}
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simple-product images */}
      {!hasVariants && (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">
              Images{' '}
              <span className="text-sm font-normal text-muted ml-2">
                {totalProductImages}/{MAX_IMAGES}
              </span>
            </h2>
          </div>
          {productImages.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {productImages.map((img) => (
                <div key={img.id} className="relative border border-line">
                  <div className="aspect-square">
                    <ProductImage path={img.storage_path} alt="product image" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                    onClick={() => onDeleteProductImage(img.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {pendingProductFiles.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {pendingProductFiles.map((file, i) => (
                <div key={i} className="relative border border-line border-dashed">
                  <div className="aspect-square theme-tint flex items-center justify-center overflow-hidden">
                    <LocalImagePreview
                      file={file}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-canvas border border-line text-xs px-2 py-0.5"
                    onClick={() => setPendingProductFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                  <p className="text-xs text-muted px-1 pb-1 truncate">Queued</p>
                </div>
              ))}
            </div>
          )}
          {totalProductImages < MAX_IMAGES && (
            <label className={`btn btn-outline cursor-pointer ${uploading ? 'opacity-60' : ''}`}>
              {uploading ? 'Uploading...' : `Add image${MAX_IMAGES - totalProductImages > 1 ? 's' : ''}`}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickProductFiles}
                disabled={uploading}
              />
            </label>
          )}
          {!editing && pendingProductFiles.length > 0 && (
            <p className="text-xs text-muted mt-2">Images will be uploaded when you click Save.</p>
          )}
        </div>
      )}

      {/* Review summary */}
      {hasVariants && colors.length > 0 && (
        <div className="max-w-2xl border border-line dark:border-dark-line p-4">
          <p className="text-sm font-medium mb-2">Review</p>
          <ul className="text-sm text-muted flex flex-col gap-1">
            <li>
              {colors.length} color{colors.length !== 1 ? 's' : ''} ·{' '}
              {colors.reduce((n, c) => n + c.sizes.filter((s) => s.size.trim()).length, 0)} size rows
            </li>
            {colors.map((c) => (
              <li key={c.key}>
                {c.name || 'Unnamed'} — {c.sizes.filter((s) => s.size.trim()).length} size(s)
                {c.salePrice.trim() !== '' ? ' (on sale)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && <p className="text-sm theme-text">{err}</p>}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving || uploading || compressing}
        >
          {saving ? 'Saving…' : uploading ? 'Uploading images…' : compressing ? 'Compressing images…' : editing ? 'Save changes' : 'Create product'}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.push('/admin/products')}>
          Cancel
        </button>
      </div>
    </div>
  );
}