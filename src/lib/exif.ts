// ============ EXIF CAPTURE-TIME READER (dependency-free) ============
// Reads a photo's capture time (EXIF DateTimeOriginal) so we can sort a pile
// of photos into the order they were actually taken.
//
// Supports JPEG (APP1/Exif segment) and HEIC/HEIF (ISO-BMFF 'Exif' item) —
// the two formats that come off phones and cameras. Returns epoch
// milliseconds, or null when no timestamp can be found.
//
// Why hand-rolled: a full EXIF library would add tens of KB to the bundle for
// what is, here, a single tag lookup. Everything below is wrapped so any parse
// anomaly degrades gracefully to null and the caller treats the photo as
// "undated" rather than crashing the import.

const TAG_DATETIME = 0x0132; // DateTime (IFD0)
const TAG_DATETIME_ORIGINAL = 0x9003; // DateTimeOriginal (Exif sub-IFD)
const TAG_DATETIME_DIGITIZED = 0x9004; // DateTimeDigitized (Exif sub-IFD)
const TAG_EXIF_IFD_POINTER = 0x8769; // IFD0 -> Exif sub-IFD offset

const MAX_HEAD = 512 * 1024; // EXIF lives near the head; this covers it cheaply

export async function readCaptureTime(file: File): Promise<number | null> {
  try {
    const head = new Uint8Array(await file.slice(0, MAX_HEAD).arrayBuffer());

    if (head[0] === 0xff && head[1] === 0xd8) {
      const tiffStart = findJpegTiff(head);
      if (tiffStart >= 0) return parseTiffDateTime(head, tiffStart);
      return null;
    }

    if (isHeif(head)) {
      const exif = await findHeifExifTiff(head, file);
      if (exif) return parseTiffDateTime(exif.buf, exif.start);
    }

    return null;
  } catch {
    return null;
  }
}

// ---- JPEG: walk segments to the APP1/Exif marker ----
function findJpegTiff(b: Uint8Array): number {
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xff) break;
    const marker = b[p + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      p += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan — pixel data begins, stop
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) break;
    if (marker === 0xe1) {
      const s = p + 4;
      // "Exif\0\0"
      if (
        b[s] === 0x45 &&
        b[s + 1] === 0x78 &&
        b[s + 2] === 0x69 &&
        b[s + 3] === 0x66 &&
        b[s + 4] === 0x00 &&
        b[s + 5] === 0x00
      ) {
        return s + 6; // TIFF header starts right after
      }
    }
    p += 2 + len;
  }
  return -1;
}

// ---- TIFF/Exif IFD walk for the date tags ----
function parseTiffDateTime(b: Uint8Array, t: number): number | null {
  const le = b[t] === 0x49 && b[t + 1] === 0x49; // 'II' little-endian
  const be = b[t] === 0x4d && b[t + 1] === 0x4d; // 'MM' big-endian
  if (!le && !be) return null;

  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    le
      ? b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 0x1000000
      : b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

  if (u16(t + 2) !== 0x002a) return null;

  // Returns { date?, exifPtr? } for a given IFD; `want` is the date tag to grab.
  const readIfd = (ifdOff: number, want: number) => {
    const out: { date?: number; exifPtr?: number } = {};
    if (ifdOff <= 0 || ifdOff + 2 > b.length) return out;
    const count = Math.min(u16(ifdOff), 200); // cap guards against misparse
    let e = ifdOff + 2;
    for (let i = 0; i < count; i++, e += 12) {
      if (e + 12 > b.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const cnt = u32(e + 4);
      if (tag === TAG_EXIF_IFD_POINTER) {
        out.exifPtr = t + u32(e + 8);
      } else if (tag === want && type === 2) {
        let vo = e + 8;
        if (cnt > 4) vo = t + u32(e + 8); // ASCII >4 bytes stored out-of-line
        if (vo + 19 <= b.length) {
          let s = '';
          for (let k = 0; k < 19; k++) s += String.fromCharCode(b[vo + k]);
          out.date = parseExifDate(s);
        }
      }
    }
    return out;
  };

  const ifd0 = t + u32(t + 4);
  const r0 = readIfd(ifd0, TAG_DATETIME);
  if (r0.exifPtr) {
    const orig = readIfd(r0.exifPtr, TAG_DATETIME_ORIGINAL);
    if (orig.date) return orig.date;
    const dig = readIfd(r0.exifPtr, TAG_DATETIME_DIGITIZED);
    if (dig.date) return dig.date;
  }
  return r0.date ?? null;
}

// EXIF dates are "YYYY:MM:DD HH:MM:SS" in local time (no zone). Parse as local.
function parseExifDate(s: string): number | undefined {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const yr = +m[1];
  if (yr < 1970 || yr > 3000) return undefined;
  const ms = new Date(yr, +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return isNaN(ms) ? undefined : ms;
}

// ---- HEIC/HEIF: ISO-BMFF box walk to the 'Exif' item ----
function isHeif(b: Uint8Array): boolean {
  if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return false; // 'ftyp'
  const brand = str4(b, 8);
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'].includes(brand);
}

function str4(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}
function u32be(b: Uint8Array, o: number): number {
  return b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

// Iterate ISO-BMFF boxes within [start, end). Yields content bounds per box.
function* boxes(b: Uint8Array, start: number, end: number) {
  let p = start;
  while (p + 8 <= end) {
    let size = u32be(b, p);
    const type = str4(b, p + 4);
    let hdr = 8;
    if (size === 1) {
      // 64-bit largesize — only the low 32 bits matter for our small head buffer
      size = u32be(b, p + 8) * 0x100000000 + u32be(b, p + 12);
      hdr = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < hdr) break;
    yield { type, start: p + hdr, end: Math.min(p + size, end) };
    p += size;
  }
}

async function findHeifExifTiff(head: Uint8Array, file: File): Promise<{ buf: Uint8Array; start: number } | null> {
  // Find 'meta' (a FullBox — its children start 4 bytes in, after version/flags).
  let meta: { start: number; end: number } | null = null;
  for (const box of boxes(head, 0, head.length)) {
    if (box.type === 'meta') {
      meta = { start: box.start + 4, end: box.end };
      break;
    }
  }
  if (!meta) return null;

  // Within meta: find the 'Exif' item id (iinf/infe) and its location (iloc).
  let exifItemId = -1;
  let iloc: { start: number; end: number } | null = null;
  for (const box of boxes(head, meta.start, meta.end)) {
    if (box.type === 'iinf') {
      const ver = head[box.start];
      const entryStart = box.start + 4 + (ver === 0 ? 2 : 4);
      for (const infe of boxes(head, entryStart, box.end)) {
        if (infe.type !== 'infe') continue;
        const iver = head[infe.start];
        let o = infe.start + 4;
        if (iver >= 2) {
          const idBytes = iver === 2 ? 2 : 4;
          const itemId = idBytes === 2 ? u16be(head, o) : u32be(head, o);
          o += idBytes + 2; // skip item_protection_index
          if (str4(head, o) === 'Exif') {
            exifItemId = itemId;
            break;
          }
        }
      }
    } else if (box.type === 'iloc') {
      iloc = { start: box.start, end: box.end };
    }
  }
  if (exifItemId < 0 || !iloc) return null;

  // Parse iloc for that item's absolute file offset + length.
  const loc = parseIloc(head, iloc.start, iloc.end, exifItemId);
  if (!loc) return null;

  // Read just the Exif item payload from the file.
  const payload = new Uint8Array(await file.slice(loc.offset, loc.offset + loc.length).arrayBuffer());
  // Payload = uint32 BE exif_tiff_header_offset, then the TIFF block.
  if (payload.length < 8) return null;
  const tiffRel = u32be(payload, 0);
  const tiffStart = 4 + tiffRel;
  if (
    tiffStart + 2 <= payload.length &&
    ((payload[tiffStart] === 0x49 && payload[tiffStart + 1] === 0x49) ||
      (payload[tiffStart] === 0x4d && payload[tiffStart + 1] === 0x4d))
  ) {
    return { buf: payload, start: tiffStart };
  }
  // Fallback: scan the first bytes for a TIFF header signature.
  for (let i = 0; i < Math.min(payload.length - 4, 32); i++) {
    if (
      (payload[i] === 0x49 && payload[i + 1] === 0x49 && payload[i + 2] === 0x2a && payload[i + 3] === 0x00) ||
      (payload[i] === 0x4d && payload[i + 1] === 0x4d && payload[i + 2] === 0x00 && payload[i + 3] === 0x2a)
    ) {
      return { buf: payload, start: i };
    }
  }
  return null;
}

function parseIloc(
  b: Uint8Array,
  start: number,
  end: number,
  wantId: number,
): { offset: number; length: number } | null {
  const ver = b[start];
  let o = start + 4; // skip version/flags
  if (o + 2 > end) return null;
  const offsetSize = (b[o] >> 4) & 0xf;
  const lengthSize = b[o] & 0xf;
  const baseOffsetSize = (b[o + 1] >> 4) & 0xf;
  const indexSize = ver === 1 || ver === 2 ? b[o + 1] & 0xf : 0;
  o += 2;

  let itemCount: number;
  if (ver < 2) {
    itemCount = u16be(b, o);
    o += 2;
  } else {
    itemCount = u32be(b, o);
    o += 4;
  }

  const readN = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[o + i];
    o += n;
    return v;
  };

  for (let i = 0; i < itemCount && o < end; i++) {
    const itemId = ver < 2 ? u16be(b, o) : u32be(b, o);
    o += ver < 2 ? 2 : 4;
    if (ver === 1 || ver === 2) o += 2; // construction_method
    o += 2; // data_reference_index
    const baseOffset = readN(baseOffsetSize);
    const extentCount = u16be(b, o);
    o += 2;
    let chosen: { offset: number; length: number } | null = null;
    for (let j = 0; j < extentCount; j++) {
      if ((ver === 1 || ver === 2) && indexSize > 0) readN(indexSize);
      const extentOffset = readN(offsetSize);
      const extentLength = readN(lengthSize);
      if (j === 0) chosen = { offset: baseOffset + extentOffset, length: extentLength };
    }
    if (itemId === wantId && chosen) return chosen;
  }
  return null;
}
