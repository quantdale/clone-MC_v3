#!/usr/bin/env node
/* global console, process */
/**
 * Unreferenced-source guard (change 301 gate 8, enforced by change 305).
 *
 * Fails when a tracked `src/**` TypeScript module has zero internal importers and is
 * not on the reviewed allow-list below. Before change 305 this program only PRINTED
 * its census and always exited 0, so the invariant `ONBOARDING.md` §7 promised
 * ("allow-list: the three real entry points") was enforced by memory, not by the gate.
 *
 * The allow-list is deliberately tiny and explicit: each entry is a source file that
 * is legitimately importer-free because a non-import mechanism loads it:
 *
 * - `src/main.ts` is the application entry point referenced by `index.html`.
 * - `src/rendering/MeshWorkerEntry.ts` and `src/worldgen/WorldgenWorkerEntry.ts` are
 *   worker entry points constructed by `new Worker(new URL('./…Entry.ts', …))`, which
 *   is not an `import` edge and cannot be expressed as one.
 *
 * Any other importer-free file is either dead code or a missed wiring, so the gate
 * exits 1 and names it. Adding an entry to the allow-list is a reviewed change to this
 * file plus its unit test (`tests/unit/VerificationGateWiring.test.ts`).
 *
 * Usage: node scripts/orphan-check.mjs [--root <repoRoot>]
 * Exit 0 when every importer-free file is allow-listed, 1 otherwise, 2 on a bad root.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(__filename), '..');

/** Reviewed, non-import-loadable entry points. */
export const ENTRY_POINT_ALLOW_LIST = Object.freeze([
  'src/main.ts',
  'src/rendering/MeshWorkerEntry.ts',
  'src/worldgen/WorldgenWorkerEntry.ts',
]);

function resolveRoot() {
  const argv = process.argv.slice(2);
  const flagIndex = argv.indexOf('--root');
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return path.resolve(argv[flagIndex + 1]);
  }
  return defaultRoot;
}

function main() {
  const root = resolveRoot();
  if (!fs.existsSync(root)) {
    console.error(`Unreferenced-source guard: root does not exist: ${root}`);
    process.exit(2);
  }

  /**
   * Tracked-file listing for one path prefix. `git ls-files` throws on a non-zero exit
   * (not a git repository, or an unreadable index), which is a root problem the guard
   * reports with its own exit code instead of a stack trace.
   */
  const gitFiles = (pattern) => {
    try {
      return execSync(`git ls-files ${pattern}`, { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
    } catch (error) {
      console.error(
        `Unreferenced-source guard: cannot list tracked '${pattern}' files under ${root}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      process.exit(2);
    }
  };

  const srcFiles = gitFiles('src').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  const testFiles = gitFiles('tests').filter((f) => f.endsWith('.ts'));

  const importRe = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;

  function resolveImport(specifier, fromFile) {
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(root, path.dirname(fromFile), specifier);
    if (fs.existsSync(`${base}.ts`)) return `${base}.ts`;
    if (fs.existsSync(path.join(base, 'index.ts'))) return path.join(base, 'index.ts');
    return null;
  }

  const srcPrefix = path.resolve(root, 'src');
  const importers = new Map();
  for (const file of [...srcFiles, ...testFiles]) {
    const text = fs.readFileSync(path.resolve(root, file), 'utf8');
    let match;
    importRe.lastIndex = 0;
    while ((match = importRe.exec(text))) {
      const resolved = resolveImport(match[1], file);
      if (!resolved || !resolved.startsWith(srcPrefix)) continue;
      importers.set(resolved, (importers.get(resolved) ?? 0) + 1);
    }
  }

  const orphans = srcFiles.filter((file) => !importers.has(path.resolve(root, file)));
  const allowed = orphans.filter((file) => ENTRY_POINT_ALLOW_LIST.includes(file));
  const unexpected = orphans.filter((file) => !ENTRY_POINT_ALLOW_LIST.includes(file));

  console.log(`Source files: ${srcFiles.length}`);
  console.log(`Allow-listed importer-free entry points present: ${allowed.length}/${ENTRY_POINT_ALLOW_LIST.length}`);
  for (const entry of ENTRY_POINT_ALLOW_LIST) {
    const mark = allowed.includes(entry) ? 'ok  ' : 'MISSING';
    console.log(`  ${mark} ${entry}`);
  }

  if (unexpected.length > 0) {
    console.error(
      `Unreferenced-source guard FAILED: ${unexpected.length} source file(s) have zero importers and are not allow-listed:`,
    );
    for (const file of unexpected) console.error(`  - ${file}`);
    console.error(
      'Wire the file into an importer, delete it, or add a reviewed entry to ENTRY_POINT_ALLOW_LIST ' +
        '(scripts/orphan-check.mjs + tests/unit/VerificationGateWiring.test.ts).',
    );
    process.exit(1);
  }

  console.log('Unreferenced-source guard PASSED: every importer-free source file is allow-listed.');
  process.exit(0);
}

main();
