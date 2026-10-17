#!/usr/bin/env node
/* global console, process */
/**
 * Canonical multiplayer performance gate (change 302, audit finding F-005).
 *
 * `tests/unit/multi-client-performance.test.ts` enforces the normative
 * multiplayer budgets REQ-P3 (`sustainedTps >= 200`) and REQ-P7
 * (`elapsedMs <= 6000`) behind
 * `it.skipIf(process.env.MC_CANONICAL !== '1')`, so the shared `npm test` suite
 * deliberately skips the contention-sensitive measurement. Before this change
 * NOTHING set `MC_CANONICAL` — `grep -rn MC_CANONICAL` matched only OpenSpec
 * documentation — so the normative budget was never executed by automation.
 *
 * This runner closes that hole:
 *   1. sets `MC_CANONICAL=1` for the child;
 *   2. pre-checks that the canonical test name still exists in the test file;
 *   3. runs ONLY that test, in isolation (`--no-file-parallelism`, single worker),
 *      so no other file competes for CPU;
 *   4. post-checks that EXACTLY ONE test actually passed.
 *
 * Step 4 is the important one. Measured: `vitest run <file> -t "<name that
 * matches nothing>"` exits **0** with every test reported `skipped`, and
 * `vitest run <file>` would run all 13. Without the count check, a renamed test
 * would silently turn this gate into a permanent pass — exactly the class of
 * defect F-005 describes.
 *
 * Cross-platform and shell-free: the child is this same Node binary running
 * vitest's own entry point, so there is no `.cmd` shim and no shell involved.
 *
 * Usage: npm run test:perf:multiplayer
 * Exit codes: 0 the canonical measurement passed; 1 the measurement failed or the
 * wrong number of tests ran; 2 the test name is absent from the test file;
 * 127 the child could not be spawned.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/** The exact describe/test name the canonical measurement must match. */
const CANONICAL_TEST_NAME = 'canonical isolated measurement';

/** The test file that owns the canonical measurement. */
const TEST_FILE = 'tests/unit/multi-client-performance.test.ts';

// ---------------------------------------------------------------------------
// Step 2: static pre-check. A renamed test must fail loudly and cheaply rather
// than produce a zero-match run.
// ---------------------------------------------------------------------------
let source;
try {
  source = readFileSync(path.resolve(TEST_FILE), 'utf8');
} catch (error) {
  console.error(`Cannot read ${TEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
if (!source.includes(`'${CANONICAL_TEST_NAME}`)) {
  console.error(`The canonical measurement test name is absent from ${TEST_FILE}.`);
  console.error(`Expected a test whose name begins with "${CANONICAL_TEST_NAME}".`);
  console.error('Update CANONICAL_TEST_NAME in this runner together with the test.');
  process.exit(2);
}

/**
 * Invoke vitest's own entry point directly through the running Node binary.
 *
 * `npm exec -- vitest …` was tried first and is NOT used: it re-resolved the
 * command through npm's exec cache and ended up running a second spec file, so
 * the count guard saw 2 files / 17 tests instead of 1 / 12. Going straight to
 * `node_modules/vitest/vitest.mjs` removes npm from the path entirely, which also
 * makes the invocation identical on every platform (no `.cmd` shim, no shell).
 */
const VITEST_ENTRY = path.resolve('node_modules', 'vitest', 'vitest.mjs');

try {
  readFileSync(VITEST_ENTRY);
} catch {
  console.error(`vitest entry point not found at ${VITEST_ENTRY} — run npm ci first.`);
  process.exit(2);
}

const argv = [
  VITEST_ENTRY,
  'run',
  TEST_FILE,
  '-t',
  CANONICAL_TEST_NAME,
  '--reporter=verbose',
  '--no-file-parallelism',
];

console.log('Canonical multiplayer performance gate');
console.log(`  file:   ${TEST_FILE}`);
console.log(`  filter: -t "${CANONICAL_TEST_NAME}"`);
console.log('  env:    MC_CANONICAL=1 (the shared `npm test` suite still skips it)');
console.log('');

const child = spawn(process.execPath, argv, {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  env: { ...process.env, MC_CANONICAL: '1' },
});

let output = '';
const collect = (chunk) => {
  process.stdout.write(chunk);
  output += chunk.toString('utf8');
};
child.stdout.on('data', collect);
child.stderr.on('data', collect);

child.on('error', (error) => {
  console.error(`Failed to spawn ${process.execPath}: ${error.message}`);
  process.exit(127);
});

child.on('close', (code, signal) => {
  if (signal) {
    console.error(`Canonical measurement terminated by signal ${signal}`);
    process.exit(1);
    return;
  }
  if ((code ?? 1) !== 0) {
    console.error('');
    console.error(`Canonical multiplayer gate FAILED (exit ${code ?? 1}) — the budget was exceeded.`);
    process.exit(code ?? 1);
    return;
  }

  // -------------------------------------------------------------------------
  // Step 4: prove exactly one test ran and passed. `vitest -t` exits 0 when the
  // filter matches nothing, so the exit code alone is not evidence.
  //
  // The captured output must be ANSI-stripped first: CI hosts run vitest with
  // colour enabled, which inserts escape sequences BETWEEN `Tests` and the counts
  // (`Tests \x1b[1m\x1b[32m1 passed`). Parsing the raw stream made this guard
  // report "zero tests" on CI even though the measurement had passed and printed
  // `Tests 1 passed | 11 skipped`.
  // -------------------------------------------------------------------------
  const ESC = String.fromCharCode(27);
  const plain = output.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');
  // vitest prints no `Tests` summary line at all when zero tests match, so a
  // missing summary is itself the zero-match signal — not an unreadable output.
  const summary = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/.exec(plain);
  if (!summary) {
    console.error('');
    console.error(
      'Canonical multiplayer gate FAILED: the filter selected zero tests (vitest printed no ' +
        'Tests summary). A zero-match filter exits 0, so this is the check that stops a ' +
        'renamed test from silently turning the normative budget into a no-op.',
    );
    process.exit(1);
  }
  const failed = Number(summary[1] ?? 0);
  const passed = Number(summary[2] ?? 0);
  const skipped = Number(summary[3] ?? 0);

  // `-t` filters WITHIN the file, so the file's other tests are legitimately
  // reported as skipped. What must hold is: exactly one test PASSED and none
  // failed. A zero-match filter yields 0 passed (12 skipped) and therefore still
  // fails here, which is the whole point of the count check.
  if (failed !== 0 || passed !== 1) {
    console.error('');
    console.error(
      `Canonical multiplayer gate FAILED: expected exactly 1 passing test and 0 failing, ` +
        `observed ${passed} passed / ${failed} failed / ${skipped} skipped.`,
    );
    console.error(
      'A zero-match filter exits 0, so this count check is what stops a renamed test ' +
        'from silently turning the normative budget into a no-op.',
    );
    process.exit(1);
  }

  console.log('');
  console.log(
    `Canonical multiplayer budgets satisfied (REQ-P3 / REQ-P7); ` +
      `1 measured, ${skipped} unrelated tests filtered out.`,
  );
  process.exit(0);
});
