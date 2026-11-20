'use client';

import { useState } from 'react';
import { getImageUrl } from '@/lib/storage';

/**
 * Renders a product image from Supabase Storage. Falls back to a neutral
 * clay-tint block (with the product title) when there is no image or the file
 * is missing, so seeded products without uploads still render cleanly.
 */
export default function ProductImage({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const url = getImageUrl(path);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-clay-tint text-muted text-sm px-4 text-center ${className ?? ''}`}
        aria-label={alt}
      >
        <span>{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
