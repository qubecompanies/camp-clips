// ============ PHOTO ANALYSIS (blur + near-duplicate) ============
// Client-side, memory-safe scoring used by the "Find best shots" scan. For each
// photo we compute:
//   - a sharpness score (variance of the Laplacian on a small grayscale) — low
//     variance means little high-frequency detail, i.e. likely blurry/soft.
//   - a 64-bit difference hash (dHash) for near-duplicate detection — burst
//     shots and re-takes land within a small Hamming distance of each other.
//
// Memory discipline matches imageProcessing.ts: we decode one image at a time
// into a tiny (<=96px) canvas, read it back, and immediately free the backing
// store. Nothing full-size is ever held. The caller yields between photos.

export interface PhotoAnalysis {
  blurScore: number; // variance of Laplacian; higher = sharper
  hash: bigint; // 64-bit dHash
}

const SHARP = 96; // grayscale working size for the Laplacian pass

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('analysis: image load failed'));
    img.src = url;
  });
}

const lum = (d: Uint8ClampedArray, i: number): number =>
  0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Analyze one photo. Returns null on any decode failure (the caller skips it).
export async function analyzePhoto(url: string): Promise<PhotoAnalysis | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImg(url);
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // ---- Sharpness: variance of the Laplacian on a SHARP×SHARP grayscale ----
  canvas.width = SHARP;
  canvas.height = SHARP;
  ctx.drawImage(img, 0, 0, SHARP, SHARP);
  const sd = ctx.getImageData(0, 0, SHARP, SHARP).data;
  const gray = new Float32Array(SHARP * SHARP);
  for (let p = 0; p < gray.length; p++) gray[p] = lum(sd, p * 4);

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < SHARP - 1; y++) {
    for (let x = 1; x < SHARP - 1; x++) {
      const i = y * SHARP + x;
      // 4-neighbour Laplacian kernel response
      const lap = gray[i - SHARP] + gray[i + SHARP] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  const blurScore = Math.max(0, sumSq / n - mean * mean);

  // ---- dHash: 9×8 grayscale, compare each pixel to its right neighbour ----
  canvas.width = 9;
  canvas.height = 8;
  ctx.drawImage(img, 0, 0, 9, 8);
  const hd = ctx.getImageData(0, 0, 9, 8).data;
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = (y * 9 + x) * 4;
      const right = (y * 9 + x + 1) * 4;
      if (lum(hd, left) > lum(hd, right)) hash |= 1n << bit;
      bit++;
    }
  }

  // Free the backing store immediately.
  canvas.width = 0;
  canvas.height = 0;

  return { blurScore, hash };
}

// Hamming distance between two 64-bit dHashes (number of differing bits).
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

// dHash distance at/under which two photos are treated as near-duplicates.
// 8/64 bits is a conservative threshold — catches burst frames and re-takes
// without lumping merely-similar scenes together.
export const DUPLICATE_MAX_DISTANCE = 8;

// Group near-duplicates and decide which to keep. Given analyses keyed by photo
// id (in grid order), returns the set of ids that are duplicates of a sharper
// sibling — i.e. the ones safe to drop. The sharpest frame in each cluster is
// always kept (never returned).
export function findDuplicateIds(analyses: Map<string, PhotoAnalysis>): Set<string> {
  const ids = [...analyses.keys()];
  const dupes = new Set<string>();
  const grouped = new Set<string>();

  for (let i = 0; i < ids.length; i++) {
    if (grouped.has(ids[i])) continue;
    const a = analyses.get(ids[i])!;
    const group = [ids[i]];
    for (let j = i + 1; j < ids.length; j++) {
      if (grouped.has(ids[j])) continue;
      const b = analyses.get(ids[j])!;
      if (hammingDistance(a.hash, b.hash) <= DUPLICATE_MAX_DISTANCE) {
        group.push(ids[j]);
        grouped.add(ids[j]);
      }
    }
    if (group.length > 1) {
      // Keep the sharpest; flag the rest as droppable duplicates.
      group.sort((x, y) => analyses.get(y)!.blurScore - analyses.get(x)!.blurScore);
      for (let k = 1; k < group.length; k++) dupes.add(group[k]);
    }
  }
  return dupes;
}
