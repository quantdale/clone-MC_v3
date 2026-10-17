import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/check-install.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the guard against a synthetic fixture root. Never throws on non-zero. */
function runGuard(root: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

interface FixtureOptions {
  lockfile?: unknown;
  /** name -> installed version; `null` writes an unreadable manifest. */
  installed?: Record<string, string | null>;
  /** When true, omit node_modules entirely (fresh tree). */
  fresh?: boolean;
  /** When true, omit package-lock.json entirely. */
  noLockfile?: boolean;
  /** When true, write raw text instead of JSON for the lockfile. */
  rawLockfile?: string;
}

/**
 * Build a throwaway fixture root: a minimal lockfile plus a `node_modules`
 * containing only the manifests the case needs.
 */
function makeFixture(options: FixtureOptions): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'check-install-'));
  if (!options.noLockfile) {
    const raw = options.rawLockfile ?? JSON.stringify(options.lockfile ?? {}, null, 2);
    writeFileSync(join(root, 'package-lock.json'), raw, 'utf8');
  }
  if (!options.fresh) {
    mkdirSync(join(root, 'node_modules'), { recursive: true });
  }
  for (const [name, version] of Object.entries(options.installed ?? {})) {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      version === null ? 'not json at all' : JSON.stringify({ name, version }),
      'utf8',
    );
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** A lockfile with the given top-level packages at the given versions. */
function lock(entries: Record<string, string>, optional: Record<string, string> = {}): unknown {
  const packages: Record<string, unknown> = {
    '': {
      version: '1.0.0',
      dependencies: {},
      devDependencies: Object.fromEntries(Object.keys(entries).map((n) => [n, '^1.0.0'])),
      ...(Object.keys(optional).length > 0
        ? { optionalDependencies: Object.fromEntries(Object.keys(optional).map((n) => [n, '^1.0.0'])) }
        : {}),
    },
  };
  for (const [name, version] of Object.entries({ ...entries, ...optional })) {
    packages[`node_modules/${name}`] = { version, resolved: `https://example.invalid/${name}`, integrity: 'sha512-x' };
  }
  return { name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages };
}

/** Recursively list a fixture directory with file sizes, for change detection. */
function snapshotTree(root: string): string {
  const result: string[] = [];
  const visit = (current: string): void => {
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, name.name);
      if (name.isDirectory()) visit(full);
      else result.push(`${full}:${statSync(full).size}`);
    }
  };
  if (existsSync(root)) visit(root);
  return result.sort().join('\n');
}

describe('scripts/check-install.mjs (299)', () => {
  it('exits 0 on a matching tree and names the verified count', () => {
    const fixture = makeFixture({
      lockfile: lock({ alpha: '2.0.0', beta: '3.1.0' }),
      installed: { alpha: '2.0.0', beta: '3.1.0' },
    });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/matches package-lock\.json/i);
      expect(result.stdout).toMatch(/2 packages verified/);
    } finally {
      fixture.cleanup();
    }
  });

  it('exits 1 on drift and prints the package/installed/locked table with the remediation command', () => {
    const fixture = makeFixture({
      lockfile: lock({ vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11', beta: '3.1.0' }),
      installed: { vitest: '3.2.7', '@vitest/coverage-v8': '3.2.7', beta: '3.1.0' },
    });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/does not match package-lock\.json/);
      expect(result.stderr).toMatch(/vitest\s+installed 3\.2\.7\s+locked 4\.1\.11/);
      expect(result.stderr).toMatch(/@vitest\/coverage-v8\s+installed 3\.2\.7\s+locked 4\.1\.11/);
      expect(result.stderr).toMatch(/Run: npm ci/);
      // The remediation command appears exactly once.
      expect(result.stderr.match(/Run: npm ci/g)).toHaveLength(1);
      // A success summary is never printed when drift exists.
      expect(result.stdout).not.toMatch(/matches package-lock\.json/i);
      // A matching package is not reported as drift.
      expect(result.stderr).not.toMatch(/beta/);
    } finally {
      fixture.cleanup();
    }
  });

  it('exits 0 on a fresh tree (no node_modules) so npm ci is never blocked', () => {
    const fixture = makeFixture({
      lockfile: lock({ alpha: '2.0.0', beta: '3.1.0' }),
      fresh: true,
    });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/fresh tree/i);
      expect(result.stderr).not.toMatch(/does not match/);
    } finally {
      fixture.cleanup();
    }
  });

  it('treats an absent platform-inapplicable optional dependency as satisfied', () => {
    // Pick a platform-specific package that cannot apply to the running host.
    const inapplicable =
      process.platform === 'win32' ? '@rollup/rollup-linux-x64-gnu' : '@rollup/rollup-win32-x64-msvc';
    const fixture = makeFixture({
      lockfile: lock({ alpha: '2.0.0' }, { [inapplicable]: '4.62.4' }),
      installed: { alpha: '2.0.0' },
    });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(0);
      expect(result.stderr).not.toMatch(/does not match/);
    } finally {
      fixture.cleanup();
    }
  });

  it('does not report a platform-inapplicable package absent from the TRANSITIVE closure', () => {
    // Regression for the exact Linux CI failure: `@rollup/rollup-win32-x64-msvc`
    // is recorded in the lockfile's transitive closure but is correctly NOT
    // installed on Linux, so the closure pass must skip it rather than report
    // drift. The earlier implementation captured the package's own name prefix as
    // the OS segment, so it never recognised any platform-specific binary.
    const inapplicable =
      process.platform === 'win32' ? '@rollup/rollup-linux-x64-gnu' : '@rollup/rollup-win32-x64-msvc';
    const lockfile = lock({ alpha: '2.0.0' });
    // Record it as a TRANSITIVE entry (locked, but not a declared dependency).
    (lockfile as { packages: Record<string, unknown> }).packages[`node_modules/${inapplicable}`] = {
      version: '4.62.4',
    };
    const fixture = makeFixture({ lockfile, installed: { alpha: '2.0.0' } });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(0);
      expect(result.stderr).not.toMatch(/does not match/);
      expect(result.stderr).not.toMatch(/win32-x64-msvc|linux-x64-gnu/);
    } finally {
      fixture.cleanup();
    }
  });

  it('reports an unreadable installed manifest as drift', () => {
    const fixture = makeFixture({
      lockfile: lock({ alpha: '2.0.0' }),
      installed: { alpha: null },
    });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/alpha\s+installed <unreadable>\s+locked 2\.0\.0/);
    } finally {
      fixture.cleanup();
    }
  });

  it('exits 2 on a malformed lockfile rather than reporting no drift', () => {
    const fixture = makeFixture({ rawLockfile: '{ not valid json' });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Malformed package-lock\.json/);
    } finally {
      fixture.cleanup();
    }
  });

  it('exits 2 when the lockfile is missing', () => {
    const fixture = makeFixture({ noLockfile: true });
    try {
      const result = runGuard(fixture.root);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Cannot read package-lock\.json/);
    } finally {
      fixture.cleanup();
    }
  });

  it('is read-only: no file under the fixture changes across every case', () => {
    const cases: FixtureOptions[] = [
      { lockfile: lock({ alpha: '2.0.0' }), installed: { alpha: '2.0.0' } },
      { lockfile: lock({ alpha: '2.0.0' }), installed: { alpha: '9.9.9' } },
      { lockfile: lock({ alpha: '2.0.0' }), fresh: true },
      { lockfile: lock({ alpha: '2.0.0' }), installed: { alpha: null } },
      { rawLockfile: '{ nope' },
      { noLockfile: true },
    ];
    for (const options of cases) {
      const fixture = makeFixture(options);
      try {
        const before = snapshotTree(fixture.root);
        runGuard(fixture.root);
        const after = snapshotTree(fixture.root);
        expect(after).toBe(before);
      } finally {
        fixture.cleanup();
      }
    }
  });

  it('verifies the real repository tree (self-application on a matched tree)', () => {
    const result = runGuard(REPO_ROOT);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/matches package-lock\.json/);
  });

  it('declares an exact packageManager pin matching the CI npm contract', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    expect(typeof pkg.packageManager).toBe('string');
    expect(pkg.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(pkg.scripts['verify:deps']).toBe('node scripts/check-install.mjs');
    expect(pkg.scripts.preinstall).toBeUndefined();
  });
});
