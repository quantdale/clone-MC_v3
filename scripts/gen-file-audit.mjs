/* global console, process */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File-audit INVENTORY generator (hardening 2026-08-23, AUDIT-EVIDENCE).
 *
 * Emits one row per `git ls-files` entry with every review field left empty and
 * `status: "pending"`. This script deliberately CANNOT produce audit verdicts:
 * the previous revision assigned `findings:'none' / status:'audited' /
 * integration:'integrated'` purely from path prefixes, which manufactured
 * clean evidence. Verdicts may only come from actual reviewed content (see
 * scripts/validate-file-audit.mjs for what a published manifest must satisfy).
 *
 * Usage: node scripts/gen-file-audit.mjs <output.json> [category-overrides.json]
 */

const root = path.resolve('.');
const outPath = process.argv[2] ?? 'file-audit-inventory.pending.json';

function classifyCategory(p) {
  if (p.startsWith('openspec/')) return 'spec';
  if (p.startsWith('tests/')) return 'test';
  if (p.startsWith('.github/') || p.startsWith('.agent/') || p.startsWith('.gemini/') ||
      p.startsWith('.claude/') || p.startsWith('.cline/') || p.startsWith('.codex/') ||
      p.startsWith('.cursor/') || p.startsWith('.kilocode/') || p.startsWith('.kimi/') ||
      p.startsWith('.opencode/')) return 'config';
  if (p.endsWith('.md')) return 'docs';
  if (p === 'package.json' || p === 'package-lock.json' || p === 'tsconfig.json' ||
      p === 'vite.config.ts' || p === 'vitest.config.ts' || p === 'playwright.config.ts' ||
      p === 'eslint.config.js' || p === 'index.html' || p === '.gitignore') return 'config';
  if (p.startsWith('src/')) return p.endsWith('.css') ? 'asset' : 'production';
  if (p.startsWith('scripts/')) return 'script';
  if (p.startsWith('dist/')) return 'generated-artifact';
  const ext = path.extname(p).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gltf', '.glb', '.wav', '.mp3'].includes(ext)) return 'binary-visual';
  if (ext === '.json') return 'data';
  if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(ext)) return 'script';
  return 'other';
}

const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const reviewedSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();

const rows = files.map((p) => ({
  path: p,
  gitBlob: null,
  category: classifyCategory(p),
  purpose: '',
  reviewLevel: '',
  runtimeReachability: '',
  imports: [],
  importedBy: [],
  testEvidence: [],
  riskAreas: [],
  findingIds: [],
  disposition: '',
  reviewNotes: '',
  status: 'pending',
}));

const out = {
  generatedAt: new Date().toISOString(),
  reviewedSha,
  schemaNote:
    'Inventory only. Every row is pending until a reviewer fills purpose/reviewLevel/' +
    'evidence/disposition from actual content. Verdict fields are never machine-assigned.',
  allowedReviewLevels: [
    'semantic',
    'mechanical',
    'generated-artifact',
    'binary-visual',
    'historical-evidence',
    'third-party-lockfile',
  ],
  total: rows.length,
  rows,
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote pending inventory with ${rows.length} rows to ${outPath}`);
console.log('NOTE: rows carry status "pending"; no verdicts are auto-assigned.');
