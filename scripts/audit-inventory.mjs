#!/usr/bin/env node
/* global console, process */
/**
 * Change 253 exhaustive every-file legacy-world inventory scanner.
 *
 * Scans tracked production/code files (src, tests, scripts, config) for the
 * legacy-world pattern families enumerated in audit-findings.md / agent-prompts
 * PROMPT 01, and emits a machine-readable inventory with a disposition per hit.
 *
 * Every hit receives an allowed disposition plus an owning task and authority
 * note. The scanner output (not planner prose) is the execution source of truth.
 * Tooling pattern definitions are not world consumers and are excluded from hit
 * output while the tooling file remains included in the scanned-file count.
 *
 * Run: node scripts/audit-inventory.mjs [--root <repo>] [--out <json>]
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(__filename), '..');

function resolveRoot() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--root');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return defaultRoot;
}
function resolvePhase() {
  return process.argv.includes('--post') ? 'post-migration' : 'pre-migration';
}
function resolveOut(root, phase) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--out');
  if (i !== -1 && argv[i + 1]) return path.resolve(root, argv[i + 1]);
  const filename = phase === 'post-migration'
    ? 'post-migration-inventory.json'
    : 'pre-migration-inventory.json';
  return path.resolve(root, `openspec/changes/253-live-world-architecture-convergence/inventory/${filename}`);
}

const ROOT = resolveRoot();
const PHASE = resolvePhase();
const OUT = resolveOut(ROOT, PHASE);

// Only code/config, never markdown/docs (the change's own prose would self-match).
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'openspec', 'docs', 'tests/e2e', 'tests/bench']);
function trackedFiles() {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // Fallback: walk the tree.
    files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!EXCLUDE_DIRS.has(e.name)) walk(p);
        } else {
          files.push(path.relative(ROOT, p).replace(/\\/g, '/'));
        }
      }
    };
    walk(ROOT);
  }
  return files.filter((f) => {
    const ext = path.extname(f);
    if (!SCAN_EXT.has(ext)) return false;
    if (EXCLUDE_DIRS.has(path.dirname(f).split('/')[0])) return false;
    if (f.startsWith('openspec/')) return false; // never treat OpenSpec prose as production
    if (f.startsWith('docs/')) return false;
    if (f.startsWith('tests/e2e/')) return false;
    if (f.startsWith('tests/bench/')) return false;
    return true;
  });
}

// Pattern families. Each: { id, re (global, multiline), category, severity, disposition(file,line,m)->string }
const isTest = (f) => f.startsWith('tests/');
const isTooling = (f) => f.startsWith('scripts/');
const SCANNER_FILE = 'scripts/audit-inventory.mjs';

const PROJECTION_FILES = new Set([
  'src/world/CanonicalWorldStorage.ts',
  'src/world/ChunkManager.ts',
  'src/world/ChunkMesher.ts',
  'src/world/TerrainGenerator.ts',
  'src/world/World.ts',
  'src/world/WorldCoordinates.ts',
  'src/worldgen/OreVeinFeature.ts',
]);

const RESOURCE_COMPATIBILITY_FILES = new Set([
  'src/rendering/MemoryResourceBudget.ts',
]);

function classify(file, pattern) {
  if (isTest(file) || isTooling(file)) {
    return {
      disposition: 'TEST_ONLY',
      owningTask: 'Task 111',
      authority: 'test/tooling-only',
      rationale: 'The occurrence is outside the playable production authority and is retained for characterization, migration, or audit tooling.',
    };
  }
  if (RESOURCE_COMPATIBILITY_FILES.has(file)) {
    return {
      disposition: 'INTENTIONAL_COMPATIBILITY_WITH_EXPIRY',
      owningTask: 'Task 98',
      authority: 'canonical-storage',
      rationale: 'The metric names a bounded compatibility projection retained for existing resource-budget and E2E reporting; it is not a writable world-state authority. Rename/reconcile its units in the resource phase before final closure.',
    };
  }
  if (PROJECTION_FILES.has(file)) {
    return {
      disposition: 'PROJECTION_ONLY',
      owningTask: pattern === 'editOverlay' ? 'Task 94' : 'Task 108',
      authority: 'canonical-storage',
      rationale: 'The live write/read authority is CanonicalWorldStorage; this occurrence belongs to the documented legacy slab, render, migration, or compatibility projection and is not consulted as canonical truth.',
    };
  }
  if (file === 'src/config/index.ts') {
    return {
      disposition: 'INTENTIONAL_COMPATIBILITY_WITH_EXPIRY',
      owningTask: 'Task 109',
      authority: 'canonical-storage',
      rationale: 'Legacy constants remain as compatibility/world-version inputs; active Overworld bounds derive from DimensionType.',
    };
  }
  return {
    disposition: 'MIGRATE',
    owningTask: 'Task 110',
    authority: 'unresolved-production',
    rationale: 'No explicit projection or test-only boundary was established for this production occurrence.',
  };
}

const PATTERNS = [
  {
    id: 'legacy-Chunk-class',
    re: /\bnew\s+Chunk\s*\(|\bChunk\b\s+(?:cy|getLocal|setLocal)/g,
    category: 'legacy-Chunk',
    severity: 'Critical',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'REMOVE'),
  },
  {
    id: 'ChunkManager-authority',
    re: /\bChunkManager\b/g,
    category: 'ChunkManager',
    severity: 'Critical',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'stateOverlay',
    re: /stateOverlay/g,
    category: 'split-truth',
    severity: 'Critical',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'REMOVE'),
  },
  {
    id: 'editOverlay',
    re: /editOverlay/g,
    category: 'legacy-edit-map',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'legacy-height-constant',
    re: /CONFIG\.chunk\.height|CHUNK_DIMENSIONS\.height|chunk\.height/g,
    category: 'legacy-height',
    severity: 'High',
    disposition: (f) => (f.includes('src/config') ? 'INTENTIONAL_COMPATIBILITY_WITH_EXPIRY' : isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'cy-eq-0',
    re: /\bcy\s*===\s*0\b|\.cy\s*===\s*0\b|chunk\.cy\s*===\s*0\b/g,
    category: 'legacy-slab-key',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'legacy-y-clamp-64',
    re: /y\s*(?:<|>=)\s*CHUNK_DIMENSIONS\.height|y\s*<\s*64\b|y\s*>=\s*64\b|y\s*<\s*0\s*\|\|\s*y\s*>=\s*64/g,
    category: 'legacy-range-clamp',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'sea-level-bedrock',
    re: /seaLevel\s*=\s*32|bedrockY\s*=\s*0|bedrockY\s*=\s*0/g,
    category: 'legacy-constants',
    severity: 'Medium',
    disposition: () => 'INTENTIONAL_COMPATIBILITY_WITH_EXPIRY',
  },
  {
    id: 'slab-chunk-key',
    re: /chunkKey\s*\(\s*cx,\s*cy,\s*cz\s*\)|keyToChunk/g,
    category: 'legacy-key',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'bare-id-persist',
    re: /\.setLocal\s*\(|\.getLocal\s*\(/g,
    category: 'bare-id-storage',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
  {
    id: 'legacy-light-bounds',
    re: /y\s*>=\s*CONFIG\.bedrockY\s*&&\s*y\s*<\s*CHUNK_DIMENSIONS\.height/g,
    category: 'legacy-light-clamp',
    severity: 'High',
    disposition: (f) => (isTest(f) ? 'TEST_ONLY' : 'MIGRATE'),
  },
];

function scanFile(file) {
  if (file === SCANNER_FILE) return [];
  const abs = path.join(ROOT, file);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split('\n');
  const hits = [];
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    lines.forEach((line, idx) => {
      const re = new RegExp(pat.re.source, pat.re.flags.includes('g') ? pat.re.flags : pat.re.flags + 'g');
      let m;
      // Only scan lines that actually contain the pattern to avoid catastrophi multi-match cost.
      if (!re.test(line)) return;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        const classification = classify(file, pat.id);
        hits.push({
          pattern: pat.id,
          category: pat.category,
          severity: pat.severity,
          file,
          line: idx + 1,
          snippet: line.trim().slice(0, 200),
          ...classification,
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  }
  return hits;
}

function main() {
  const files = trackedFiles();
  const all = [];
  for (const f of files) {
    all.push(...scanFile(f));
  }
  const byDisposition = {};
  const bySeverity = {};
  const byCategory = {};
  for (const h of all) {
    byDisposition[h.disposition] = (byDisposition[h.disposition] ?? 0) + 1;
    bySeverity[h.severity] = (bySeverity[h.severity] ?? 0) + 1;
    byCategory[h.category] = (byCategory[h.category] ?? 0) + 1;
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    totalHits: all.length,
    byDisposition,
    bySeverity,
    byCategory,
    criticalHighProductionHits: all.filter(
      (h) => (h.severity === 'Critical' || h.severity === 'High') && h.authority !== 'test/tooling-only',
    ).length,
    unresolvedCriticalHighProductionHits: all.filter(
      (h) =>
        (h.severity === 'Critical' || h.severity === 'High') &&
        h.authority === 'unresolved-production',
    ).length,
  };
  const artifact = { summary, hits: all };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n');
  console.log('Scanned', files.length, 'files;', all.length, 'hits.');
  console.log('Dispositions:', JSON.stringify(byDisposition));
  console.log('Severity:', JSON.stringify(bySeverity));
  console.log('Critical/High production hits:', summary.criticalHighProductionHits);
  console.log('Wrote', OUT);
}

main();
