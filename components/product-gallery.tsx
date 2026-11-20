'use client';

import { useState } from 'react';
import ProductImage from '@/components/product-image';
import type { ProductImage as ProductImageType } from '@/lib/types';

export default function ProductGallery({
  images,
  alt,
}: {
  images: ProductImageType[];
  alt: string;
}) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const [active, setActive] = useState(0);

  if (sorted.length === 0) {
    return (
      <div className="aspect-[4/5] w-full border border-line bg-clay-tint flex items-center justify-center text-muted">
        {alt}
      </div>
    );
  }

  const current = sorted[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-canvas">
        <ProductImage
          path={current.storage_path}
          alt={alt}
          className="w-full h-full object-cover"
        />
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-3">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              className={`w-16 h-20 overflow-hidden border ${
                i === active ? 'border-clay' : 'border-line'
              } bg-canvas`}
            >
              <ProductImage
                path={img.storage_path}
                alt={alt}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
