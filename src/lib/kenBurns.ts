import { useStore } from '../state/store';
import { shuffle, easeInOut } from './utils';
import type { KbType, KbPlan, Photo } from '../state/types';

// ============ KEN BURNS MOTION ENGINE ============
// A "plan" describes how one photo moves while on screen. Both the live
// preview (CSS transforms via Web Animations API) and the export (canvas
// drawImage math) consume the same plan, so what you preview is what you
// export. Plans are generated once per photo and cached on the photo object.

const KB_TYPES: KbType[] = ['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'panUp', 'panDown'];
let _kbBag: KbType[] = [];

// Draw from a shuffled "bag" so we cycle through all motion types before
// repeating — gives genuine variety instead of random clustering.
function _nextKbType(allowPan: boolean): KbType {
  if (!_kbBag.length) _kbBag = shuffle(KB_TYPES.slice());
  let t = _kbBag.pop()!;
  if (!allowPan && t.indexOf('pan') === 0) {
    t = Math.random() < 0.5 ? 'zoomIn' : 'zoomOut';
  }
  return t;
}

// Smart focal point: faces in camp photos cluster slightly above center
// (rule of thirds upper line). Real ML face detection could replace this
// by writing photo.kbPlan.focal directly.
function _defaultFocal() {
  return { x: 0.5, y: 0.42 };
}

export function ensureKbPlan(photo: Photo, naturalW: number, naturalH: number): KbPlan {
  if (photo.kbPlan) return photo.kbPlan;
  const w = naturalW || 16,
    h = naturalH || 9;
  const tall = h / w > 1.4; // clearly a single-subject portrait
  const fillMode: 'cover' | 'contain' = tall ? 'contain' : 'cover'; // preserve tall portraits, fill the rest
  const allowPan = fillMode === 'cover';
  const type = _nextKbType(allowPan);
  photo.kbPlan = { type, focal: _defaultFocal(), fillMode };
  return photo.kbPlan;
}

// ===== LIVE (CSS / Web Animations API) =====
interface KbImg extends HTMLImageElement {
  _kbAnim?: Animation | null;
}

export function applyLiveKenBurns(imgEl: KbImg, photo: Photo, motionMs: number): void {
  const settings = useStore.getState().settings;
  imgEl.classList.remove('kb-cover', 'kb-contain');
  // cancel any prior animation on this element
  if (imgEl._kbAnim) {
    try {
      imgEl._kbAnim.cancel();
    } catch (e) {
      /* ignore */
    }
    imgEl._kbAnim = null;
  }

  if (!settings.kenBurns) {
    imgEl.classList.add('kb-contain');
    imgEl.style.transform = 'none';
    return;
  }

  const plan = ensureKbPlan(photo, imgEl.naturalWidth, imgEl.naturalHeight);
  imgEl.classList.add(plan.fillMode === 'cover' ? 'kb-cover' : 'kb-contain');
  imgEl.style.transformOrigin = `${plan.focal.x * 100}% ${plan.focal.y * 100}%`;

  const Z = settings.kenBurnsIntensity;
  const zoomed = 1 + Z;
  const p = Math.min(Z * 50, 6); // pan distance in % of element

  let from: string, to: string;
  switch (plan.type) {
    case 'zoomIn':
      from = `scale(1)`;
      to = `scale(${zoomed})`;
      break;
    case 'zoomOut':
      from = `scale(${zoomed})`;
      to = `scale(1)`;
      break;
    case 'panLeft':
      from = `scale(${zoomed}) translate(${p}%, 0)`;
      to = `scale(${zoomed}) translate(${-p}%, 0)`;
      break;
    case 'panRight':
      from = `scale(${zoomed}) translate(${-p}%, 0)`;
      to = `scale(${zoomed}) translate(${p}%, 0)`;
      break;
    case 'panUp':
      from = `scale(${zoomed}) translate(0, ${p}%)`;
      to = `scale(${zoomed}) translate(0, ${-p}%)`;
      break;
    case 'panDown':
      from = `scale(${zoomed}) translate(0, ${-p}%)`;
      to = `scale(${zoomed}) translate(0, ${p}%)`;
      break;
    default:
      from = `scale(1)`;
      to = `scale(${zoomed})`;
  }

  try {
    imgEl._kbAnim = imgEl.animate([{ transform: from }, { transform: to }], {
      duration: motionMs,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
  } catch (e) {
    // Web Animations API unavailable — fall back to static
    imgEl.style.transform = to;
  }
}

export function pauseKbAnims(imgs: (KbImg | null)[]): void {
  imgs.forEach((im) => {
    if (im && im._kbAnim) {
      try {
        im._kbAnim.pause();
      } catch (e) {
        /* ignore */
      }
    }
  });
}
export function resumeKbAnims(imgs: (KbImg | null)[]): void {
  imgs.forEach((im) => {
    if (im && im._kbAnim) {
      try {
        im._kbAnim.play();
      } catch (e) {
        /* ignore */
      }
    }
  });
}
export function cancelKbAnims(imgs: (KbImg | null)[]): void {
  imgs.forEach((im) => {
    if (im && im._kbAnim) {
      try {
        im._kbAnim.cancel();
      } catch (e) {
        /* ignore */
      }
      im._kbAnim = null;
    }
  });
}

// ===== EXPORT (canvas drawImage math) =====
function _computeBaseFit(W: number, H: number, iw: number, ih: number, mode: 'cover' | 'contain') {
  let scale;
  if (mode === 'cover') scale = Math.max(W / iw, H / ih);
  else scale = Math.min(W / iw, H / ih);
  const w = iw * scale,
    h = ih * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// Returns destination rect {x,y,w,h} for drawImage at motion progress t (0..1)
function _applyKbToRect(
  base: { x: number; y: number; w: number; h: number },
  plan: KbPlan,
  t: number,
  W: number,
  H: number,
  Z: number,
) {
  const te = easeInOut(t);
  const zoomed = 1 + Z;
  const fx = plan.focal.x,
    fy = plan.focal.y;
  let kb: number,
    panX = 0,
    panY = 0;

  if (plan.type === 'zoomIn') kb = 1 + Z * te;
  else if (plan.type === 'zoomOut') kb = zoomed - Z * te;
  else kb = zoomed; // pans hold a constant zoom

  const scaledW = base.w * kb,
    scaledH = base.h * kb;
  // keep focal point fixed during zoom
  const focalScreenX = base.x + fx * base.w;
  const focalScreenY = base.y + fy * base.h;
  let x = focalScreenX - fx * scaledW;
  let y = focalScreenY - fy * scaledH;

  // pans: translate within the available overscan
  if (plan.type.indexOf('pan') === 0) {
    const slackX = Math.max(0, (scaledW - W) / 2) * 0.9;
    const slackY = Math.max(0, (scaledH - H) / 2) * 0.9;
    const dir = 2 * te - 1; // -1 .. +1
    if (plan.type === 'panLeft') panX = -dir * slackX;
    if (plan.type === 'panRight') panX = dir * slackX;
    if (plan.type === 'panUp') panY = -dir * slackY;
    if (plan.type === 'panDown') panY = dir * slackY;
    // recentre for pans (focal = center) so panning axis is symmetric
    x = (W - scaledW) / 2;
    y = (H - scaledH) / 2;
  }

  return { x: x + panX, y: y + panY, w: scaledW, h: scaledH };
}

export function drawKB(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: CanvasImageSource & { width: number; height: number },
  plan: KbPlan | null,
  t: number,
  alpha?: number,
): void {
  const settings = useStore.getState().settings;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (!settings.kenBurns || !plan) {
    // static contain fit
    const base = _computeBaseFit(W, H, img.width, img.height, 'contain');
    ctx.drawImage(img, base.x, base.y, base.w, base.h);
    ctx.restore();
    return;
  }
  const base = _computeBaseFit(W, H, img.width, img.height, plan.fillMode);
  const r = _applyKbToRect(base, plan, t, W, H, settings.kenBurnsIntensity);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  ctx.restore();
}
