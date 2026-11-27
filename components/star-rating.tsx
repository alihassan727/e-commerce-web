'use client';

import { useState } from 'react';

/** Displays a row of 5 stars. If `interactive`, clicking sets the value. */
export default function StarRating({
  value,
  onChange,
  size = 'md',
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg';
  const interactive = Boolean(onChange);

  return (
    <span className={`inline-flex gap-0.5 ${sizeClass}`} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const tone = n <= display ? 'theme-text' : 'text-muted dark:text-dark-muted';
        if (!interactive) {
          return (
            <span key={n} className={tone} aria-hidden="true">
              ★
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n === value}
            className={`${tone} cursor-pointer`}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}
