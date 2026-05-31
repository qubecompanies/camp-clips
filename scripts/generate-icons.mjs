// Rasterizes the Camp Clips aperture mark into the PNG icon set + OG image.
// Source of truth for the artwork is brand/camp-clips-identity-package.html.
// Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public');
mkdirSync(out, { recursive: true });

// Aperture "B" — amber field, for app icons. rx controls corner rounding.
const apertureB = (rx) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${rx}" fill="#F59E0B"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#14181F" stroke-width="3"/>
  <path d="M32 12 A20 20 0 0 0 12 32 L22 32 A10 10 0 0 1 32 22 Z" fill="#4338CA"/>
  <path d="M12 32 A20 20 0 0 0 32 52 L32 42 A10 10 0 0 1 22 32 Z" fill="#14181F"/>
  <path d="M32 52 A20 20 0 0 0 52 32 L42 32 A10 10 0 0 1 32 42 Z" fill="#FFFFFF"/>
  <circle cx="32" cy="32" r="5" fill="#F59E0B"/>
</svg>`;

// Bare aperture, cream blades — for use on the dark OG card.
const bareCream = `
  <circle cx="32" cy="32" r="28" fill="none" stroke="#FCE7B5" stroke-width="3"/>
  <path d="M32 8 A24 24 0 0 0 8 32 L20 32 A12 12 0 0 1 32 20 Z" fill="#F59E0B"/>
  <path d="M8 32 A24 24 0 0 0 32 56 L32 44 A12 12 0 0 1 20 32 Z" fill="#4338CA"/>
  <path d="M32 56 A24 24 0 0 0 56 32 L44 32 A12 12 0 0 1 32 44 Z" fill="#FCE7B5"/>
  <circle cx="32" cy="32" r="6" fill="#FFFFFF"/>`;

// 1200x630 social/OG card. Fraunces may not be installed on the build machine;
// the serif fallback keeps it clean. Screenshot the identity package's OG
// section if you want pixel-perfect Fraunces.
const ogCard = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14181F"/>
      <stop offset="0.5" stop-color="#1A1F26"/>
      <stop offset="1" stop-color="#2D2B5C"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.5">
      <stop offset="0" stop-color="#F59E0B" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(72,64)">
    <svg x="0" y="0" width="56" height="56" viewBox="0 0 64 64">${bareCream}</svg>
    <text x="76" y="38" font-family="Fraunces, Georgia, serif" font-size="30" font-weight="500" fill="#FCE7B5">Camp Clips</text>
  </g>
  <text x="72" y="330" font-family="Fraunces, Georgia, serif" font-size="76" font-weight="500" fill="#FCE7B5">The week,</text>
  <text x="72" y="420" font-family="Fraunces, Georgia, serif" font-size="76" font-weight="400" font-style="italic" fill="#F59E0B">in one watchable show.</text>
  <text x="72" y="566" font-family="'JetBrains Mono', monospace" font-size="20" letter-spacing="2" fill="#BCAE86">campclips.qubecompanies.com</text>
  <text x="1128" y="566" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="20" letter-spacing="2" fill="#BCAE86">By Qube</text>
</svg>`;

const jobs = [
  // Maskable / PWA — full-bleed square (rx 0) so platform masking is clean.
  { svg: apertureB(0), size: 512, file: 'icon-512.png' },
  { svg: apertureB(0), size: 192, file: 'icon-192.png' },
  // Apple touch icon — iOS rounds it itself, so full-bleed.
  { svg: apertureB(0), size: 180, file: 'apple-touch-icon.png' },
  // Browser-tab favicons — rounded reads better on light tab bars.
  { svg: apertureB(14), size: 32, file: 'favicon-32.png' },
  { svg: apertureB(14), size: 16, file: 'favicon-16.png' },
];

for (const j of jobs) {
  await sharp(Buffer.from(j.svg)).resize(j.size, j.size).png().toFile(resolve(out, j.file));
  console.log('wrote', j.file);
}
await sharp(Buffer.from(ogCard)).png().toFile(resolve(out, 'og-image.png'));
console.log('wrote og-image.png');
