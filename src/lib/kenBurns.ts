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

// Fallback focal when no faces are detected: camp photos tend to put subjects
// slightly above center (rule of thirds upper line).
function _defaultFocal() {
  return { x: 0.5, y: 0.42 };
}

// Cap zoom on face photos so people stay comfortably in frame. Even at the
// "energetic" 18% global intensity, a face shot should not push past ~10%.
const FACE_MAX_ZOOM = 0.1;

export function ensureKbPlan(photo: Photo, _naturalW: number, _naturalH: number): KbPlan {
  if (photo.kbPlan) return photo.kbPlan;
  const settings = useStore.getState().settings;

  // Fit (contain): show the WHOLE photo letterboxed — quality over fill, no lost
  // edges/heads. Fill (cover): crop to fill the frame. User-controlled via the
  // Fit/Fill toggle (settings.photoFit). Consumers also read the live setting so
  // toggling re-frames instantly without regenerating plans (motion is zoom-only,
  // so it's always safe in either mode).
  const fillMode: 'cover' | 'contain' = settings.photoFit;

  // FACE-AWARE PLAN: anchor the gentle zoom on the detected faces.
  if (photo.face) {
    const type: KbType = Math.random() < 0.5 ? 'zoomIn' : 'zoomOut';
    const zoom = Math.min(settings.kenBurnsIntensity, FACE_MAX_ZOOM);
    photo.kbPlan = { type, focal: { ...photo.face.focal }, fillMode, zoom };
    return photo.kbPlan;
  }

  // No faces: gentle ZOOM ONLY. Panning a letterboxed photo just slides it over
  // the black bars, which reads as broken — and the cross-screen pan was the
  // source of the visible judder. Zoom about the focal point is smooth.
  const type = _nextKbType(false);
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

  // Read the fit mode live so the Fit/Fill toggle re-frames instantly.
  const fit = settings.photoFit;

  if (!settings.kenBurns) {
    imgEl.classList.add(fit === 'cover' ? 'kb-cover' : 'kb-contain');
    imgEl.style.transform = 'none';
    return;
  }

  const plan = ensureKbPlan(photo, imgEl.naturalWidth, imgEl.naturalHeight);
  imgEl.classList.add(fit === 'cover' ? 'kb-cover' : 'kb-contain');
  imgEl.style.transformOrigin = `${plan.focal.x * 100}% ${plan.focal.y * 100}%`;
  // In cover mode the image is cropped to fill the frame; object-position shifts
  // that crop so the focal point (faces, when detected) is what's kept, instead
  // of the default center crop that can lop heads off.
  imgEl.style.objectPosition =
    fit === 'cover' ? `${plan.focal.x * 100}% ${plan.focal.y * 100}%` : '50% 50%';

  const Z = plan.zoom ?? settings.kenBurnsIntensity;
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

  // Force the image onto its own GPU compositor layer for the whole animation.
  // translateZ(0) promotes it so the zoom is composited (smooth) rather than
  // repainted on the main thread (which judders, especially at high zoom).
  from += ' translateZ(0)';
  to += ' translateZ(0)';

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
function _computeBaseFit(
  W: number,
  H: number,
  iw: number,
  ih: number,
  mode: 'cover' | 'contain',
  focal?: { x: number; y: number },
) {
  let scale;
  if (mode === 'cover') scale = Math.max(W / iw, H / ih);
  else scale = Math.min(W / iw, H / ih);
  const w = iw * scale,
    h = ih * scale;
  // For cover, bias the crop so the focal point (faces) lands at the same
  // relative spot in the frame — mirrors CSS object-position in the live
  // preview. Centered when no focal is given or in contain mode (letterbox).
  if (mode === 'cover' && focal) {
    const x = Math.min(0, Math.max(W - w, focal.x * (W - w)));
    const y = Math.min(0, Math.max(H - h, focal.y * (H - h)));
    return { x, y, w, h };
  }
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
  const fit = settings.photoFit;
  if (!settings.kenBurns || !plan) {
    // static fit — respect the Fit/Fill toggle (focal-biased crop in cover mode)
    const base = _computeBaseFit(W, H, img.width, img.height, fit, plan?.focal);
    ctx.drawImage(img, base.x, base.y, base.w, base.h);
    ctx.restore();
    return;
  }
  const base = _computeBaseFit(W, H, img.width, img.height, fit, plan.focal);
  const Z = plan.zoom ?? settings.kenBurnsIntensity;
  const r = _applyKbToRect(base, plan, t, W, H, Z);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  ctx.restore();
}
