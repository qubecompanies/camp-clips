// ============ IMAGE PROCESSING (memory-safe) ============
// Critical constraints (DO NOT simplify — this pipeline was rewritten
// specifically to prevent memory explosions that crashed a dev machine):
// - We must NOT hold the original full-size file data in memory after downscaling
// - We must NOT use canvas.toDataURL() (creates huge base64 strings)
// - We must yield between photos so the browser can garbage-collect
// - We prefer Object URLs (blob pointers, ~8 bytes) over data URLs (base64, full size)
// - For sandboxed webviews where blob: URLs fail to load, we fall back to data URL
//   ONLY for that one image, so 99% of imports stay memory-efficient

export const MAX_IMAGE_DIM = 1600; // sufficient for 1920x1080 playback, ~60% smaller than 2048

export interface ProcessedImage {
  url: string;
  revocable: boolean;
  width: number;
  height: number;
}

function fileToDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

// Test once whether blob: URLs work in this environment (some sandboxed
// webviews block them). Cached so we only test once per session.
let _blobUrlsWork: boolean | null = null;
async function testBlobUrlSupport(): Promise<boolean> {
  if (_blobUrlsWork !== null) return _blobUrlsWork;
  try {
    // Tiny 1x1 transparent PNG
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
    const blob = new Blob([pngBytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    _blobUrlsWork = await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      setTimeout(() => resolve(false), 1500);
    });
    URL.revokeObjectURL(url);
  } catch (e) {
    _blobUrlsWork = false;
  }
  console.log('[image] blob URL support:', _blobUrlsWork);
  return _blobUrlsWork;
}

// Convert a blob to either an Object URL (preferred) or data URL (fallback)
async function blobToUsableUrl(blob: Blob): Promise<{ url: string; revocable: boolean }> {
  const blobOk = await testBlobUrlSupport();
  if (blobOk) return { url: URL.createObjectURL(blob), revocable: true };
  // Fallback for sandboxed webviews
  return { url: await fileToDataURL(blob), revocable: false };
}

// Decode a file/blob to an ImageBitmap (off-main-thread, releases source faster)
// imageOrientation: 'from-image' tells the browser to apply EXIF orientation
// during decode, so portrait photos taken on iPhones land upright automatically.
async function decodeToBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (e) {
      // Older browsers may not support the options object — try without
      try {
        return await createImageBitmap(blob);
      } catch (e2) {
        /* fall through */
      }
    }
  }
  // Fallback path using Image (browser auto-applies EXIF orientation on <img>
  // in all modern engines as of 2021+)
  return new Promise((resolve, reject) => {
    const tmpUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(tmpUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(tmpUrl);
      reject(new Error('Decode failed'));
    };
    img.src = tmpUrl;
  });
}

// Convert a canvas to a blob (vastly more memory-efficient than toDataURL)
function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), type, quality);
    } else {
      // toBlob unavailable — last resort
      try {
        const dataUrl = canvas.toDataURL(type, quality);
        fetch(dataUrl)
          .then((r) => r.blob())
          .then(resolve)
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    }
  });
}

// Process a single image file into a {url, width, height} record.
// Memory-safe: at no point do we hold both the original and the downscaled in memory.
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

  // Step 1: get a decodable blob (HEIC needs conversion first)
  let sourceBlob: Blob = file;
  if (isHeic) {
    // Lazy-load heic2any only when a HEIC/HEIF file is actually imported.
    // It's a heavy dependency (~1.5 MB) and most users never touch HEIC, so
    // keeping it out of the main bundle saves them the download entirely.
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    sourceBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  // Step 2: decode to bitmap (this is the high-memory moment; we hold a single
  // decoded bitmap, not multiple data URLs). The 'from-image' option auto-applies
  // EXIF orientation so portrait iPhone photos land upright.
  const bmp = await decodeToBitmap(sourceBlob);
  const w = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth;
  const h = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight;

  // Step 3: always go through the canvas path. Even when we don't need to
  // downscale, re-encoding bakes the EXIF-applied orientation into the bytes,
  // so when we later draw to the export canvas the photo lands right-side up.
  const scale = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h, 1);
  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, newW, newH);
  if ((bmp as ImageBitmap).close) (bmp as ImageBitmap).close(); // release ImageBitmap memory immediately

  // Step 4: canvas → blob (NOT data URL) → usable URL
  const outBlob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
  // Clear the canvas immediately so its backing store can be freed
  canvas.width = 0;
  canvas.height = 0;

  const usable = await blobToUsableUrl(outBlob);
  return { ...usable, width: newW, height: newH };
}
