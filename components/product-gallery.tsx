'use client';

import { useState } from 'react';
import ProductImage from '@/components/product-image';

type GalleryImage = { id: string; storage_path: string; sort_order: number };

export default function ProductGallery({
  images,
  alt,
}: {
  images: GalleryImage[];
  alt: string;
}) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const [active, setActive] = useState(0);

  if (sorted.length === 0) {
    return (
      <div className="aspect-[4/5] w-full rounded-lg border border-line dark:border-dark-line theme-tint flex items-center justify-center text-muted dark:text-dark-muted text-sm">
        {alt}
      </div>
    );
  }

  const current = sorted[Math.min(active, sorted.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] w-full overflow-hidden rounded-lg border border-line dark:border-dark-line bg-surface dark:bg-dark-surface">
        <ProductImage
          path={current.storage_path}
          alt={alt}
          className="w-full h-full object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority={active === 0}
        />
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              className={`w-16 h-20 shrink-0 overflow-hidden rounded-md border transition-colors ${
                i === active
                  ? 'theme-border'
                  : 'border-line dark:border-dark-line opacity-75 hover:opacity-100'
              } bg-surface dark:bg-dark-surface`}
            >
              <ProductImage
                path={img.storage_path}
                alt={alt}
                className="w-full h-full object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
