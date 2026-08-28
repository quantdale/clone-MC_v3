/* global console, process */
/**
 * SEC-001 release-bundle assertion (design addendum §G).
 *
 * The `window.__voxelGame` test hook must exist ONLY in the E2E build
 * (`VITE_E2E=true`, used by Playwright). A plain production build
 * (`npm run build`) must never contain the hook. This script scans the built
 * `dist/` artifact and fails with exit code 1 if the hook string appears.
 *
 * Usage: npm run build && node scripts/check-release-bundle.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve('.');
const dist = path.join(root, 'dist');
const HOOK = '__voxelGame';

const targets = [];
const assetsDir = path.join(dist, 'assets');
if (fs.existsSync(assetsDir)) {
  for (const entry of fs.readdirSync(assetsDir)) {
    if (entry.endsWith('.js')) targets.push(path.join(assetsDir, entry));
  }
}
const indexHtml = path.join(dist, 'index.html');
if (fs.existsSync(indexHtml)) targets.push(indexHtml);

if (targets.length === 0) {
  console.error('FAIL: no dist artifacts found — run `npm run build` before this check.');
  process.exit(1);
}

const offenders = [];
for (const file of targets) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(HOOK)) offenders.push(path.relative(root, file));
}

if (offenders.length > 0) {
  console.error(
    `FAIL: E2E hook "${HOOK}" leaked into the release bundle:\n` +
      offenders.map((o) => `  - ${o}`).join('\n'),
  );
  process.exit(1);
}

console.log(`${targets.length} assets checked; no E2E hook found`);
