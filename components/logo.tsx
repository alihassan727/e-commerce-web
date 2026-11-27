import Link from 'next/link';
import type { SiteSettings } from '@/lib/types';

/**
 * Renders the site logo based on site_settings.
 * - mode 'image': shows logo_url image if available, falls back to text.
 * - mode 'text': renders styled text using the configured font/size/weight.
 */
export default function Logo({ settings }: { settings: SiteSettings | null }) {
  const mode        = settings?.logo_mode ?? 'text';
  const logoUrl     = settings?.logo_url ?? null;
  const storeName   = settings?.store_name ?? 'Atlas Clothier';
  const logoText    = settings?.logo_text || storeName;
  const font        = settings?.logo_font ?? 'serif';
  const fontSize    = settings?.logo_font_size ?? '1.5rem';
  const fontWeight  = settings?.logo_font_weight ?? '400';
  const color       = settings?.logo_color ?? '#1B1A18';
  const letterSpacing = settings?.logo_letter_spacing ?? 'normal';

  if (mode === 'image' && logoUrl) {
    return (
      <Link href="/" aria-label={storeName}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={storeName} className="h-10 w-auto object-contain" />
      </Link>
    );
  }

  // Text logo (default)
  const fontClass = font === 'serif' ? 'font-serif' : 'font-sans';
  const useThemeInk = !color || color.toUpperCase() === '#1B1A18';
  return (
    <Link
      href="/"
      className={`tracking-tight ${fontClass} ${useThemeInk ? 'text-ink dark:text-dark-ink' : ''}`}
      style={{
        fontSize,
        fontWeight,
        color: useThemeInk ? undefined : color,
        letterSpacing: letterSpacing === 'normal' ? undefined : letterSpacing,
        textDecoration: 'none',
      }}
    >
      {logoText}
    </Link>
  );
}
