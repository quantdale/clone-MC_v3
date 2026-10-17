import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_BASELINE_BUDGETS } from '../../src/simulation/MultiClientLoadHarness';
import { readSource } from '../support/sourceText';

const REPO_ROOT = resolve(__dirname, '../..');
const RUNNER = resolve(REPO_ROOT, 'scripts/perf/multiplayer-perf-run.mjs');
const REAL_TEST_FILE = resolve(REPO_ROOT, 'tests/unit/multi-client-performance.test.ts');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runNode(script: string, cwd?: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

interface VariantOptions {
  /** Override the canonical test name constant. */
  testName?: string;
  /** Disable the static "name still exists" pre-check. */
  skipPrecheck?: boolean;
  /** Point the runner at a cheap synthetic fixture instead of the real measurement. */
  useFixture?: boolean;
}

/**
 * Build a copy of the real runner with selected constants substituted.
 *
 * The real `tests/unit/multi-client-performance.test.ts` measurement takes ~2 s
 * per run and asserts WALL-CLOCK budgets, so it must never be driven from inside
 * the shared unit suite (that suite runs files in parallel with coverage
 * instrumentation, and a contended measurement fails legitimately). The guard
 * logic is therefore exercised against a cheap synthetic fixture, and the real
 * measurement is left to `npm run test:perf:multiplayer` and the dedicated
 * single-worker `perf-multiplayer` CI job — the same isolation rationale that put
 * REQ-P3/REQ-P7 behind `it.skipIf(MC_CANONICAL !== '1')` in the first place.
 */
function makeVariant(options: VariantOptions): { script: string; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'mp-perf-'));
  let src = readFileSync(RUNNER, 'utf8');

  // Always resolve vitest's entry point against the real repository.
  src = src.replace(
    /path\.resolve\('node_modules', 'vitest', 'vitest\.mjs'\)/,
    `path.resolve(${JSON.stringify(REPO_ROOT)}, 'node_modules', 'vitest', 'vitest.mjs')`,
  );

  if (options.useFixture) {
    // The fixture lives in the throwaway temp dir, never inside the repository:
    // a transient file under tests/ would be visible to the file-audit manifest
    // gate while it runs and make that unrelated gate fail flakily.
    const fixtureFile = join(dir, 'fixture.test.ts');
    // Two fast tests so a multi-match filter is also expressible.
    writeFileSync(
      fixtureFile,
      [
        "import { describe, expect, it } from 'vitest';",
        // The describe name must NOT contain the canonical filter substring, or
        // every test in the block would match and skew the count guard.
        "describe('fixture block', () => {",
        "  it('canonical isolated measurement fixture', () => {",
        '    expect(1 + 1).toBe(2);',
        '  });',
        "  it('second fixture test', () => {",
        '    expect(2 + 2).toBe(4);',
        '  });',
        '});',
        '',
      ].join('\n'),
      'utf8',
    );
    src = src.replace(
      /^const TEST_FILE = .*$/m,
      `const TEST_FILE = ${JSON.stringify(fixtureFile)};`,
    );
  }

  if (options.testName !== undefined) {
    src = src.replace(
      /^const CANONICAL_TEST_NAME = .*$/m,
      `const CANONICAL_TEST_NAME = ${JSON.stringify(options.testName)};`,
    );
  }
  if (options.useFixture) {
    // Point vitest at the fixture's directory so its include glob resolves there.
    // `--root` is a vitest CLI option, so it goes after `run`, not before the
    // entry point (which is the node script itself).
    src = src.replace(
      /^const TEST_FILE = .*$/m,
      `const TEST_FILE = 'fixture.test.ts';\nconst VITEST_ROOT = ${JSON.stringify(dir)};`,
    );
    src = src.replace(
      /(const argv = \[\n\s*VITEST_ENTRY,\n\s*'run',)/,
      "$1\n  '--root', VITEST_ROOT,",
    );
  }
  if (options.skipPrecheck) {
    src = src.replace(/if \(!source\.includes\([^)]*\)\) \{/, 'if (false) {');
  }

  const script = join(dir, 'runner.mjs');
  writeFileSync(script, src, 'utf8');
  return {
    script,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('canonical multiplayer performance gate (302)', () => {
  it('is exposed as test:perf:multiplayer and leaves npm test semantics alone', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:perf:multiplayer']).toBe('node scripts/perf/multiplayer-perf-run.mjs');
    // `npm test` must stay the plain suite: the canonical measurement remains
    // skipIf-guarded so the shared suite never runs the contention-sensitive test.
    expect(pkg.scripts.test).toBe('vitest run');
  });

  it('sets MC_CANONICAL only for its own child, and the shared suite keeps its guard', () => {
    const runner = readSource(RUNNER);
    expect(runner).toMatch(/MC_CANONICAL:\s*'1'/);
    const test = readSource(REAL_TEST_FILE);
    expect(test).toMatch(/it\.skipIf\(process\.env\.MC_CANONICAL !== '1'\)/);
  });

  it('runs exactly one selected test and reports budget success', () => {
    const variant = makeVariant({ useFixture: true });
    try {
      const result = runNode(variant.script, variant.dir);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/MC_CANONICAL=1/);
      expect(combined).toMatch(/Tests\s+1 passed/);
      expect(combined).toMatch(/budgets satisfied \(REQ-P3 \/ REQ-P7\)/);
      expect(result.status).toBe(0);
    } finally {
      variant.cleanup();
    }
  }, 120_000);

  it('fails with exit 2 when the canonical test name is absent (renamed test)', () => {
    const variant = makeVariant({ useFixture: true, testName: 'canonical isolated measurement RENAMED-xyz' });
    try {
      const result = runNode(variant.script, variant.dir);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/test name is absent/);
      expect(result.stderr).toMatch(/RENAMED-xyz/);
    } finally {
      variant.cleanup();
    }
  }, 120_000);

  it('fails with exit 1 when the filter selects zero tests (the vitest no-op hazard)', () => {
    // The exact defect class F-005 describes: `vitest -t <no match>` exits 0 with
    // everything skipped. With the static pre-check disabled, the post-run count
    // guard is the only thing between a rename and a permanent false pass.
    const variant = makeVariant({ useFixture: true, testName: 'no such test whatsoever qq', skipPrecheck: true });
    try {
      const result = runNode(variant.script, variant.dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/selected zero tests/);
    } finally {
      variant.cleanup();
    }
  }, 120_000);

  it('rejects a filter that selects more than one test', () => {
    const variant = makeVariant({ useFixture: true, testName: 'fixture' });
    try {
      const result = runNode(variant.script, variant.dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/expected exactly 1 passing test/);
    } finally {
      variant.cleanup();
    }
  }, 120_000);

  it('pins the normative budget constants the gate enforces', () => {
    // The audit measured a healthy budget; these are the floors/ceilings the
    // canonical test asserts against. Pinned so a silent relaxation fails here.
    expect(DEFAULT_BASELINE_BUDGETS.minTicksPerSecond).toBe(200);
    expect(DEFAULT_BASELINE_BUDGETS.maxElapsedMsForTicks).toBe(6000);
  });

  it('parses an ANSI-coloured summary exactly as CI emits it', () => {
    // The exact CI failure: the measurement PASSED and printed
    // `Tests 1 passed | 11 skipped`, but the guard reported "zero tests" because
    // vitest's colour escapes sit between `Tests` and the counts. The parser must
    // strip ANSI before matching, and a genuine zero-match must still not match.
    const ESC = String.fromCharCode(27);
    const strip = (text: string): string =>
      text.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');
    const summaryRe = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/;

    const coloured =
      `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m1 passed${ESC}[39m${ESC}[22m` +
      `${ESC}[2m | ${ESC}[22m${ESC}[33m11 skipped${ESC}[39m${ESC}[90m (12)${ESC}[39m`;

    // The raw stream does NOT match — this is exactly what broke CI.
    expect(summaryRe.exec(coloured)).toBeNull();
    // Stripped, it parses to the correct counts.
    const match = summaryRe.exec(strip(coloured));
    expect(match).not.toBeNull();
    expect(match?.[1] ?? null).toBeNull(); // no failures
    expect(match?.[2]).toBe('1');
    expect(match?.[3]).toBe('11');
    // A genuine zero-match still yields no summary line.
    expect(summaryRe.exec(strip('No test files found, exiting with code 0'))).toBeNull();
    // And the runner really does strip before matching.
    expect(readSource(RUNNER)).toContain('String.fromCharCode(27)');
  });

  it('spawns without a shell (portable, no .cmd shim, no argument interpolation)', () => {
    const runner = readSource(RUNNER);
    expect(runner).toMatch(/shell:\s*false/);
    expect(runner).toMatch(/process\.execPath/);
    expect(runner).not.toMatch(/shell:\s*process\.platform === 'win32'/);
  });

  it('is wired into a dedicated CI job, separate from the shared suites', () => {
    const ci = readSource(resolve(REPO_ROOT, '.github/workflows/ci.yml'));
    expect(ci).toMatch(/perf-multiplayer:/);
    expect(ci).toContain('npm run test:perf:multiplayer');
    // The job must be its own top-level job so it does not share CPU with the
    // gate/e2e halves (otherwise the wall-clock budget measures contention).
    const jobIndex = ci.indexOf('  perf-multiplayer:');
    expect(jobIndex).toBeGreaterThan(-1);
    const after = ci.slice(jobIndex);
    expect(after).toContain('npm ci');
  });
});
