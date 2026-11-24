const BUCKET = 'product-images';

/**
 * Builds the public URL for an object in the product-images storage bucket.
 * Returns null when no path is provided so the UI can render a neutral block.
 */
export function getImageUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/**
 * Builds a public URL for any Supabase Storage bucket.
 * Use this for cms-assets, avatars, or any bucket other than product-images.
 */
export function getStorageUrl(
  bucket: string,
  storagePath: string | null | undefined,
): string | null {
  if (!storagePath) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/**
 * Returns true when a string looks like a full Supabase Storage URL
 * (i.e., it already contains /storage/v1/object/public/).
 * Used to avoid double-prefixing paths that were stored as full URLs.
 */
export function isFullStorageUrl(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return pathOrUrl.startsWith('http') && pathOrUrl.includes('/storage/v1/object/public/');
}

/**
 * Resolves a hero image value that may be stored either as a relative path
 * ("hero/desktop-123.jpg") or as a full Supabase URL.
 * Always returns a full URL ready for <img src=...> or null.
 */
export function getHeroImageUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (isFullStorageUrl(pathOrUrl)) return pathOrUrl;
  return getStorageUrl('cms-assets', pathOrUrl);
}
