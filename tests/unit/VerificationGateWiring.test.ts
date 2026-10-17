import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readSource } from '../support/sourceText';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/verify-all.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], cwd = REPO_ROOT): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** The documented gate order the aggregate must follow. */
const EXPECTED_ORDER = [
  'dependency-tree',
  'program-state',
  'typecheck',
  'lint',
  'build',
  'release-bundle',
  'file-audit',
  'unreferenced-source',
  'addon-preflight',
  'visual-goldens',
  'unit',
  'coverage',
  'browser',
];

describe('scripts/verify-all.mjs aggregate command (301)', () => {
  it('lists the gates in the documented order, dependency-tree first', () => {
    const result = run(['--list']);
    expect(result.status).toBe(0);
    const listed = [...result.stdout.matchAll(/^ {2}([a-z-]+) {2,}/gm)].map((m) => m[1]);
    expect(listed).toEqual(EXPECTED_ORDER);
    // The dependency-tree check must precede every toolchain-sensitive gate.
    expect(listed[0]).toBe('dependency-tree');
    expect(listed.indexOf('visual-goldens')).toBeLessThan(listed.indexOf('browser'));
  });

  it('runs a single selected gate and reports PASS', () => {
    const result = run(['--only=program-state']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/── program-state/);
    expect(result.stdout).toMatch(/PASS program-state/);
    expect(result.stdout).toMatch(/ALL GATES PASS \(1 gate/);
  });

  it('exits 2 on an unknown gate name', () => {
    const result = run(['--only=not-a-gate']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Unknown gate "not-a-gate"/);
  });

  it('rejects using --only and --from together', () => {
    const result = run(['--only=lint', '--from=build']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/not both/);
  });

  it('propagates a gate\'s non-zero exit code unchanged', () => {
    // A throwaway project whose gate script exits 7: proves the exit code is
    // propagated rather than normalised to 1, on a real child process.
    const root = mkdtempSync(join(tmpdir(), 'verify-all-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          private: true,
          scripts: { 'fail-first': 'node -e "process.exit(7)"' },
        }),
        'utf8',
      );
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      let status = 0;
      try {
        execFileSync(npm, ['run', '--silent', 'fail-first'], {
          cwd: root,
          stdio: 'pipe',
          shell: process.platform === 'win32',
        });
      } catch (error) {
        status = (error as { status?: number }).status ?? -1;
      }
      expect(status).toBe(7);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loudly when package.json is missing a referenced gate script', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-all-missing-'));
    try {
      // No scripts at all: every npm-referenced gate is undeclared.
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true, scripts: {} }), 'utf8');
      const result = run(['--only=program-state'], root);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing gate scripts/);
      expect(result.stderr).toMatch(/program-state -> validate-state/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is exposed as the verify:all npm script', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['verify:all']).toBe('node scripts/verify-all.mjs');
  });

  it('declares every npm-exposed gate script in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    const required = [
      'verify:deps',
      'verify:visual-goldens',
      'verify:file-audit',
      'gen:file-audit',
      'verify:orphans',
      'verify:mcp',
      'verify:inventory',
      'evidence:archive',
      'verify:all',
    ];
    for (const name of required) {
      expect(pkg.scripts[name], `missing script ${name}`).toBeTruthy();
    }
    // Report generators must be exposed too (they are not gates).
    expect(pkg.scripts['verify:file-audit']).toMatch(/validate-file-audit\.mjs/);
    expect(pkg.scripts['verify:file-audit']).toMatch(/file-audit-manifest\.json/);
  });

  it('wires the fast invariant guards into CI', () => {
    const ci = readSource(resolve(REPO_ROOT, '.github/workflows/ci.yml'));
    for (const cmd of ['verify:deps', 'verify:file-audit', 'verify:orphans', 'verify:mcp']) {
      expect(ci, `CI is missing ${cmd}`).toContain(`npm run ${cmd}`);
    }
    // They must run before the heavy suites so an invariant break is cheap.
    const guardIndex = ci.indexOf('npm run verify:orphans');
    const unitIndex = ci.indexOf('name: Unit tests');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(unitIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(unitIndex);
  });
});
