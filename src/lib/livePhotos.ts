// ============ LIVE PHOTO PAIRING ============
// iPhones export a Live Photo as TWO files that share a basename: the still
// (IMG_1234.HEIC / .JPG) and a short motion clip (IMG_1234.MOV). When both halves
// land in the same import we keep the still and silently drop the motion clip —
// that's the locked "filename-paired ⇒ use the still automatically" decision.
//
// This is a pure helper (no DOM, no store) so both the drag-drop path and the
// folder/photos picker can share the exact same pairing rule.

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

// Split the videos from one import into the ones we keep (no matching still in
// the same batch) and a count of the ones dropped as Live Photo motion halves.
export function partitionLivePhotos(
  images: File[],
  videos: File[],
): { keptVideos: File[]; pairedCount: number } {
  if (!videos.length || !images.length) return { keptVideos: videos, pairedCount: 0 };
  const stillBases = new Set(images.map((f) => baseName(f.name)));
  const keptVideos: File[] = [];
  let pairedCount = 0;
  for (const v of videos) {
    if (stillBases.has(baseName(v.name))) pairedCount++;
    else keptVideos.push(v);
  }
  return { keptVideos, pairedCount };
}
