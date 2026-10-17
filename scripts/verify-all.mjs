#!/usr/bin/env node
/* global console, process */
/**
 * Aggregate verification command (change 301, audit finding F-004).
 *
 * Runs the repository's mandatory gate sequence in the documented order and
 * stops at the FIRST failing gate, propagating that gate's own exit code. This
 * exists because the repository shipped eight verification programs of which six
 * were reachable only by typing a file path — so the gates that every change's
 * `verification.md` claims as mandatory were enforced by human memory alone.
 *
 * Usage:
 *   npm run verify:all
 *   node scripts/verify-all.mjs --list
 *   node scripts/verify-all.mjs --only=<gate>
 *   node scripts/verify-all.mjs --from=<gate>
 *
 * `--only` and `--from` are targeted re-run conveniences, NOT the default; the
 * authoritative invocation is the bare command, which runs every gate.
 *
 * Ordering rationale (see the change design):
 *   1. the dependency-tree check first, because every later gate's meaning
 *      depends on the installed toolchain matching the lockfile (change 299);
 *   2. cheap static checks next, so an obvious error costs seconds;
 *   3. build before the release-bundle assertion, which inspects `dist/`;
 *   4. cheap repository-invariant gates before the heavy suites, so an invariant
 *      break is reported in seconds instead of after a 30-minute browser run;
 *   5. unit -> coverage -> browser last, matching the CI job split.
 *
 * Exit codes: 0 when every executed gate passes; otherwise the failing gate's own
 * exit code. Unknown gate names and undeclared package scripts exit 2.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** On Windows `npm` is a `.cmd` shim. Node >= 20 refuses to spawn a `.cmd`
 *  directly without a shell (EINVAL), so on Windows the gate is run through the
 *  shell; on POSIX it is spawned directly. Every token comes from the literal
 *  GATES table above, so no untrusted input reaches the shell. */
const USE_SHELL = process.platform === 'win32';
const NPM = 'npm';

const root = path.resolve('.');
const TAIL_LINES = 40;

/** One gate: a stable name, the argv to run, and the invariant it protects. */
const GATES = [
  { name: 'dependency-tree', cmd: ['npm', 'run', '--silent', 'verify:deps'], purpose: 'installed tree == package-lock.json' },
  { name: 'program-state', cmd: ['npm', 'run', '--silent', 'validate-state'], purpose: 'OpenSpec state is coherent' },
  { name: 'typecheck', cmd: ['npm', 'run', '--silent', 'typecheck'], purpose: 'TypeScript compiles' },
  { name: 'lint', cmd: ['npm', 'run', '--silent', 'lint'], purpose: 'ESLint reports no errors' },
  { name: 'build', cmd: ['npm', 'run', '--silent', 'build'], purpose: 'production bundle builds' },
  { name: 'release-bundle', cmd: ['node', 'scripts/check-release-bundle.mjs'], purpose: 'no E2E hook in the plain bundle' },
  { name: 'file-audit', cmd: ['npm', 'run', '--silent', 'verify:file-audit'], purpose: 'file-audit manifest covers every tracked file' },
  { name: 'unreferenced-source', cmd: ['npm', 'run', '--silent', 'verify:orphans'], purpose: 'no new unreferenced source' },
  { name: 'addon-preflight', cmd: ['npm', 'run', '--silent', 'verify:mcp'], purpose: 'MCP config is pinned and secret-free' },
  { name: 'visual-goldens', cmd: ['npm', 'run', '--silent', 'verify:visual-goldens'], purpose: 'committed goldens are not stale' },
  { name: 'unit', cmd: ['npm', 'run', '--silent', 'test'], purpose: 'unit suite passes' },
  { name: 'coverage', cmd: ['npm', 'run', '--silent', 'test:coverage'], purpose: 'coverage thresholds hold' },
  { name: 'browser', cmd: ['npm', 'run', '--silent', 'test:e2e'], purpose: 'browser suite and visual matrix pass' },
];

function fail(message) {
  console.error(message);
  process.exit(2);
}

/** Map the leading `npm` token to the platform-correct executable. */
function toArgv(cmd) {
  return cmd[0] === 'npm' ? [NPM, ...cmd.slice(1)] : cmd;
}

/**
 * Fail loudly when the aggregate references an npm script that package.json does
 * not declare: a renamed script must not silently turn a gate into a no-op.
 */
function assertDeclaredScripts() {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Cannot read package.json: ${detail}`);
    process.exit(2);
  }
  const declared = new Set(Object.keys(pkg.scripts ?? {}));
  const missing = [];
  for (const gate of GATES) {
    if (gate.cmd[0] !== 'npm') continue;
    const runIndex = gate.cmd.indexOf('run');
    if (runIndex < 0) continue;
    const script = gate.cmd.slice(runIndex + 1).find((token) => !token.startsWith('-'));
    if (script && !declared.has(script)) missing.push(`${gate.name} -> ${script}`);
  }
  if (missing.length > 0) {
    console.error('verify-all: package.json is missing gate scripts:');
    for (const entry of missing) console.error(`  - ${entry}`);
    process.exit(2);
  }
}

/** Resolve a `--only=<name>` / `--from=<name>` selector into a gate list. */
function selectGates(argv) {
  const only = argv.find((a) => a.startsWith('--only='));
  const from = argv.find((a) => a.startsWith('--from='));
  if (only && from) fail('Use --only=<gate> or --from=<gate>, not both.');
  if (only) {
    const name = only.slice('--only='.length);
    const gate = GATES.find((g) => g.name === name);
    if (!gate) fail(`Unknown gate "${name}". Run --list to see the ordered gates.`);
    return [gate];
  }
  if (from) {
    const name = from.slice('--from='.length);
    const index = GATES.findIndex((g) => g.name === name);
    if (index < 0) fail(`Unknown gate "${name}". Run --list to see the ordered gates.`);
    return GATES.slice(index);
  }
  return GATES;
}

/** Run one gate, streaming its output, and resolve with its exit code. */
function runGate(gate) {
  const argv = toArgv(gate.cmd);
  const command = USE_SHELL ? argv.join(' ') : argv[0];
  const commandArgs = USE_SHELL ? [] : argv.slice(1);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: USE_SHELL,
      env: process.env,
    });

    const tail = [];
    const collect = (chunk) => {
      process.stdout.write(chunk);
      tail.push(...chunk.toString('utf8').split('\n'));
      while (tail.length > TAIL_LINES) tail.shift();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    child.on('error', (error) => {
      console.error(`Failed to spawn ${command}: ${error.message}`);
      settle(127);
    });
    child.on('close', (code, signal) => {
      if (signal) {
        console.error(`Gate ${gate.name} terminated by signal ${signal}`);
        settle(1);
        return;
      }
      settle(code ?? 1);
    });
  });
}

const args = process.argv.slice(2);

if (args.includes('--list')) {
  console.log('Ordered verification gates:');
  for (const gate of GATES) console.log(`  ${gate.name.padEnd(20)} ${gate.purpose}`);
  process.exit(0);
}

assertDeclaredScripts();
const selected = selectGates(args);

console.log(`Running ${selected.length} verification gate(s) in order:`);
for (const gate of selected) console.log(`  ${gate.name.padEnd(20)} ${gate.purpose}`);
console.log('');

for (const gate of selected) {
  console.log(`── ${gate.name} …`);
  const started = Date.now();
  const code = await runGate(gate);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (code !== 0) {
    console.error('');
    console.error(`FAIL ${gate.name} (exit ${code}) after ${seconds}s — ${gate.purpose}`);
    process.exit(code);
  }
  console.log(`PASS ${gate.name} (${seconds}s)`);
  console.log('');
}

console.log(`ALL GATES PASS (${selected.length} gate(s))`);
process.exit(0);
