'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getImageUrl } from '@/lib/storage';

/**
 * Renders an optimized product image from Supabase Storage using next/image.
 * Falls back to a neutral accent-tint block (with the product title) when
 * there is no image or the file fails to load.
 */
export default function ProductImage({
  path,
  alt,
  className,
  sizes = '(max-width: 768px) 50vw, 25vw',
  priority = false,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const url = getImageUrl(path);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center theme-tint text-muted dark:text-dark-muted text-xs px-4 text-center ${className ?? ''}`}
        aria-label={alt}
      >
        <span className="line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={640}
      height={800}
      sizes={sizes}
      priority={priority}
      quality={82}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
