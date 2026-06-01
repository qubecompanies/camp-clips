// ============ FACE DETECTION (framing assist) ============
// Runs ONCE per photo at import time, on the already-downscaled canvas (≤1600px,
// already in memory) — never in the playback/export hot path. The detected
// faces give us a focal point so Ken Burns motion anchors on people instead of
// guessing the centre, and a union bounding box so we can cap zoom and bias the
// crop to keep faces in frame.
//
// MediaPipe Tasks Vision (BlazeFace short-range) is loaded lazily — the WASM
// runtime + model are only fetched the first time a photo is imported, then
// cached for the session. Assets are self-hosted under /public/mediapipe so the
// app stays self-contained (no runtime CDN dependency, works offline once cached).
//
// Everything degrades gracefully: if the runtime fails to load or detection
// throws, we return null and the motion engine falls back to centre framing.

import type { FaceDetector } from '@mediapipe/tasks-vision';
import type { FaceFraming } from '../state/types';

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

let _detectorPromise: Promise<FaceDetector | null> | null = null;

function getDetector(): Promise<FaceDetector | null> {
  if (_detectorPromise) return _detectorPromise;
  _detectorPromise = (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
      console.log('[faces] detector ready');
      return detector;
    } catch (err) {
      console.warn('[faces] detector init failed — falling back to centre framing:', err);
      return null;
    }
  })();
  return _detectorPromise;
}

// Detect faces on the downscaled import canvas. Returns normalized framing data,
// or null if no faces were found (or detection is unavailable).
export async function detectFaceFraming(canvas: HTMLCanvasElement): Promise<FaceFraming | null> {
  const detector = await getDetector();
  if (!detector) return null;

  let detections;
  try {
    detections = detector.detect(canvas).detections || [];
  } catch (err) {
    console.warn('[faces] detect failed:', err);
    return null;
  }

  const W = canvas.width || 1;
  const H = canvas.height || 1;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let sumX = 0,
    sumY = 0,
    sumWt = 0,
    count = 0;

  for (const d of detections) {
    const b = d.boundingBox;
    if (!b || b.width <= 0 || b.height <= 0) continue;
    count++;
    const cx = b.originX + b.width / 2;
    const cy = b.originY + b.height / 2;
    // Weight by face area so nearer/larger faces dominate the focal point —
    // a distant background face shouldn't pull the camera off the main subject.
    const wt = b.width * b.height;
    sumX += cx * wt;
    sumY += cy * wt;
    sumWt += wt;
    minX = Math.min(minX, b.originX);
    minY = Math.min(minY, b.originY);
    maxX = Math.max(maxX, b.originX + b.width);
    maxY = Math.max(maxY, b.originY + b.height);
  }

  if (!count || !sumWt) return null;

  return {
    focal: { x: clamp01(sumX / sumWt / W), y: clamp01(sumY / sumWt / H) },
    region: {
      x: clamp01(minX / W),
      y: clamp01(minY / H),
      w: clamp01((maxX - minX) / W),
      h: clamp01((maxY - minY) / H),
    },
    count,
  };
}
