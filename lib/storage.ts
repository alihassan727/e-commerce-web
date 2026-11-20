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
