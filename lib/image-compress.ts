/**
 * Client-side image compression and resizing utility.
 * Compresses oversized images to WebP (with JPEG fallback) before uploading
 * to Supabase Storage, while skipping already-optimized small images, SVGs,
 * and animated GIFs.
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  /** Skip compression when file is already <= skipBelowBytes and within dimensions. */
  skipBelowBytes?: number;
}

const DEFAULT_OPTS: Required<CompressOptions> = {
  maxWidth: 1600,
  maxHeight: 2000,
  quality: 0.84,
  skipBelowBytes: 150 * 1024, // 150 KB
};

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function replaceExtension(filename: string, newExt: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${newExt}`;
}

/**
 * Compresses an image File in the browser if it is larger than `skipBelowBytes`
 * or exceeds `maxWidth` / `maxHeight`. Returns the original File on unsupported
 * formats (SVG/GIF) or if compression does not reduce size.
 */
export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  const opts = { ...DEFAULT_OPTS, ...options };

  try {
    const img = await loadImageElement(file);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const needsResize = srcW > opts.maxWidth || srcH > opts.maxHeight;
    if (!needsResize && file.size <= opts.skipBelowBytes) {
      return file;
    }

    const scale = Math.min(1, opts.maxWidth / srcW, opts.maxHeight / srcH);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (supports transparency); fall back to JPEG if the browser
    // doesn't support WebP encoding.
    let blob = await canvasToBlob(canvas, 'image/webp', opts.quality);
    let outMime = 'image/webp';
    let outExt = 'webp';

    if (!blob || blob.type !== 'image/webp') {
      // JPEG has no alpha channel. Paint a white background behind the image
      // so transparent PNGs don't turn black in the fallback.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.restore();

      blob = await canvasToBlob(canvas, 'image/jpeg', opts.quality);
      outMime = 'image/jpeg';
      outExt = 'jpg';
    }

    if (!blob) return file;

    // Only use compressed version if it actually saved space or we resized an oversized image.
    if (!needsResize && blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name, outExt), {
      type: outMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/**
 * Compresses multiple image files sequentially to keep memory usage predictable.
 */
export async function compressImages(
  files: File[],
  options?: CompressOptions,
): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    result.push(await compressImage(file, options));
  }
  return result;
}
