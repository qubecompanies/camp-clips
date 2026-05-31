// GitHub Pages has no server-side rewrites. Copying index.html to 404.html
// makes Pages serve the SPA shell for unknown paths (e.g. /app on refresh),
// letting React Router resolve the route client-side.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = resolve(root, 'dist', 'index.html');
const fallback = resolve(root, 'dist', '404.html');

if (!existsSync(index)) {
  console.error('spa-fallback: dist/index.html not found — run vite build first.');
  process.exit(1);
}
copyFileSync(index, fallback);
console.log('spa-fallback: wrote dist/404.html');
