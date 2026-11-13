// ── Unreferenced-source gate enforcement (change 305) ────────────────────────
//
// Before change 305 `scripts/orphan-check.mjs` printed its census and always exited
// 0, while `ONBOARDING.md` §7 documented the gate as "No new source file has zero
// importers (allow-list: the three real entry points)". These tests pin the enforced
// contract: the reviewed allow-list contents, the pass path on the real tree, and
// the fail path on a synthetic root that contains one unexpected orphan.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readSource } from '../support/sourceText';

const REPO_ROOT = resolve(__dirname, '../..');
const ORPHAN_SCRIPT = resolve(REPO_ROOT, 'scripts/orphan-check.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[], cwd = REPO_ROOT): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** The reviewed allow-list, quoted from the guard so a widened list fails here too. */
function declaredAllowList(): string[] {
  const source = readSource(ORPHAN_SCRIPT);
  const match = /export const ENTRY_POINT_ALLOW_LIST = Object\.freeze\(\[(.*?)\]\);/s.exec(source);
  expect(match, 'ENTRY_POINT_ALLOW_LIST declaration not found').toBeTruthy();
  const body = match?.[1] ?? '';
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

function withFixture(files: Record<string, string>, check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'orphan-syntax-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      const target = join(root, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    execFileSync('git', ['init', '-q', '.'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'pipe' });
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('scripts/orphan-check.mjs enforces its allow-list (305)', () => {
  it('declares exactly the three non-import-loadable entry points', () => {
    expect(declaredAllowList()).toEqual([
      'src/main.ts',
      'src/rendering/MeshWorkerEntry.ts',
      'src/worldgen/WorldgenWorkerEntry.ts',
    ]);
  });

  it('passes on the real tree and reports the allow-listed entry points', () => {
    const result = run(ORPHAN_SCRIPT, []);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Unreferenced-source guard PASSED');
    for (const entry of declaredAllowList()) {
      expect(result.stdout).toContain(entry);
    }
  }, 30000);

  it('fails with exit 1 and names the file when an unexpected orphan exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'orphan-guard-'));
    try {
      const allowList = declaredAllowList();
      for (const entry of allowList) {
        const target = join(root, entry);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, 'export const present = true;\n');
      }
      // One importer-free module that is NOT allow-listed.
      const stray = join(root, 'src/StrayModule.ts');
      writeFileSync(stray, 'export const stray = true;\n');
      execFileSync('git', ['init', '-q', '.'], { cwd: root });
      execFileSync('git', ['add', '-A'], { cwd: root });

      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src/StrayModule.ts');
      expect(result.stderr).toContain('Unreferenced-source guard FAILED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  it('rejects import-like text in comments and ordinary strings', () => {
    withFixture({
      'src/main.ts': `// import { dead } from './Commented';\nconst text = "export { dead } from './Quoted'";\nvoid text;\n`,
      'src/Commented.ts': 'export const dead = 1;\n',
      'src/Quoted.ts': 'export const dead = 2;\n',
    }, (root) => {
      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src/Commented.ts');
      expect(result.stderr).toContain('src/Quoted.ts');
    });
  });

  it('recognizes real static, side-effect, type, export, dynamic, require and import-equals references', () => {
    withFixture({
      'src/main.ts': `import { value } from './Static';
import './SideEffect';
import type { Shape } from './Types';
export { other } from './Export';
import legacy = require('./Legacy');
const dynamic = import('./Dynamic');
const required = require('./Required');
void [value, dynamic, required, legacy];
let shape: Shape; void shape!;`,
      'src/Static.ts': 'export const value = 1;',
      'src/SideEffect.ts': 'export const sideEffect = 1;',
      'src/Types.ts': 'export type Shape = number;',
      'src/Export.ts': 'export const other = 1;',
      'src/Legacy.ts': 'export const legacy = 1;',
      'src/Dynamic.ts': 'export const dynamic = 1;',
      'src/Required.ts': 'export const required = 1;',
    }, (root) => {
      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status, result.stderr).toBe(0);
    });
  });

  it('resolves tracked explicit extensions and directory indexes without inventing edges', () => {
    withFixture({
      'src/main.ts': `import './One.ts'; import './Two.js'; import './folder'; import 'Orphan'; import './missing';`,
      'src/One.ts': 'export const one = 1;',
      'src/Two.ts': 'export const two = 2;',
      'src/folder/index.ts': 'export const three = 3;',
      'src/Orphan.ts': 'export const orphan = 4;',
    }, (root) => {
      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src/Orphan.ts');
      expect(result.stderr).not.toContain('src/One.ts');
      expect(result.stderr).not.toContain('src/Two.ts');
      expect(result.stderr).not.toContain('src/folder/index.ts');
    });
  });

  it('fails closed on invalid syntax and invalid roots', () => {
    withFixture({ 'src/main.ts': 'export const broken = ;' }, (root) => {
      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('src/main.ts');
    });
    withFixture({ 'src/main.ts': 'export const main = true;', 'src/Deleted.ts': 'export const x = 1;' }, (root) => {
      rmSync(join(root, 'src/Deleted.ts'));
      const result = run(ORPHAN_SCRIPT, ['--root', root], root);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Deleted.ts');
    });
    expect(run(ORPHAN_SCRIPT, ['--root']).status).toBe(2);
    const root = mkdtempSync(join(tmpdir(), 'orphan-not-git-'));
    try {
      expect(run(ORPHAN_SCRIPT, ['--root', root], root).status).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is the verify:orphans npm gate (not an advisory report)', () => {
    const pkg = JSON.parse(readSource(resolve(REPO_ROOT, 'package.json'))) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['verify:orphans']).toBe('node scripts/orphan-check.mjs');
    // The aggregate runner must treat it as a blocking gate.
    const aggregate = readSource(resolve(REPO_ROOT, 'scripts/verify-all.mjs'));
    expect(aggregate).toContain("name: 'unreferenced-source'");
    expect(aggregate).toContain('verify:orphans');
  });

  it('is documented in the gate catalogue as enforced', () => {
    const onboarding = readSource(resolve(REPO_ROOT, 'ONBOARDING.md'));
    expect(onboarding).toContain('verify:orphans');
    expect(onboarding.toLowerCase()).toContain('allow-list');
    expect(onboarding.toLowerCase()).toContain('exit');
  });
});
