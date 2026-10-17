import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CAPTURED_SURFACE_GLOBS } from '../visual/matrix';
import { readSource } from '../support/sourceText';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(REPO_ROOT, 'scripts/check-visual-goldens.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCheck(cwd: string, env: Record<string, string> = {}): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, cwd], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** A throwaway git repo with a controllable commit history. */
function makeRepo(): { root: string; commit: (files: Record<string, string>, date: string) => string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'visual-goldens-'));
  const git = (args: string[], env: Record<string, string> = {}): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'core.autocrlf', 'false']);

  const commit = (files: Record<string, string>, date: string): string => {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(root, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content, 'utf8');
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `commit ${date}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    return git(['rev-parse', 'HEAD']);
  };

  return { root, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('visual golden staleness check (300)', () => {
  it('exits 0 when the golden set is newer than every captured surface', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>', 'src/styles.css': 'a{}' }, '2026-01-01T00:00:00Z');
      repo.commit(
        { 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG', 'src/rendering/x.ts': 'export {};' },
        '2026-02-01T00:00:00Z',
      );
      const result = runCheck(repo.root);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/are fresh against captured surface/);
    } finally {
      repo.cleanup();
    }
  });

  it('exits 1 when a captured surface changed after the golden set', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>' }, '2026-01-01T00:00:00Z');
      repo.commit({ 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG' }, '2026-02-01T00:00:00Z');
      const surfaceSha = repo.commit({ 'index.html': '<html>v2 CHANGED</html>' }, '2026-03-01T00:00:00Z');
      const result = runCheck(repo.root);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Visual goldens are stale/);
      expect(result.stderr).toMatch(new RegExp(surfaceSha));
      expect(result.stderr).toMatch(/tests\/visual-golden\/linux-ci/);
      expect(result.stderr).toMatch(/UPDATE_SNAPSHOTS=1/);
    } finally {
      repo.cleanup();
    }
  });

  it('exits 0 when the exact newest surface commit is acknowledged', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>' }, '2026-01-01T00:00:00Z');
      repo.commit({ 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG' }, '2026-02-01T00:00:00Z');
      const surfaceSha = repo.commit({ 'src/styles.css': '.hud{color:red}' }, '2026-03-01T00:00:00Z');
      const result = runCheck(repo.root, { VISUAL_GOLDENS_ACKNOWLEDGED: surfaceSha });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/acknowledged/);
    } finally {
      repo.cleanup();
    }
  });

  it('ignores an acknowledgement that names a different commit', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>' }, '2026-01-01T00:00:00Z');
      repo.commit({ 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG' }, '2026-02-01T00:00:00Z');
      const surfaceSha = repo.commit({ 'src/styles.css': '.hud{color:red}' }, '2026-03-01T00:00:00Z');
      const result = runCheck(repo.root, { VISUAL_GOLDENS_ACKNOWLEDGED: 'deadbeef'.repeat(5) });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/does not match/);
      expect(result.stderr).toMatch(new RegExp(surfaceSha));
    } finally {
      repo.cleanup();
    }
  });

  it('exits 2 when the golden directory is missing', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>' }, '2026-01-01T00:00:00Z');
      const result = runCheck(repo.root);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Golden directory is missing/);
    } finally {
      repo.cleanup();
    }
  });

  it('skips a line-ending-only change to a captured surface', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>\nline\n</html>\n' }, '2026-01-01T00:00:00Z');
      repo.commit({ 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG' }, '2026-02-01T00:00:00Z');
      // Same logical content, CRLF endings only: a change 298-style renormalisation.
      repo.commit({ 'index.html': '<html>\r\nline\r\n</html>\r\n' }, '2026-03-01T00:00:00Z');
      const result = runCheck(repo.root);
      expect(result.status).toBe(0);
    } finally {
      repo.cleanup();
    }
  });

  it('is read-only: no file is created, modified, or deleted', () => {
    const repo = makeRepo();
    try {
      repo.commit({ 'index.html': '<html>v1</html>' }, '2026-01-01T00:00:00Z');
      repo.commit({ 'tests/visual-golden/linux-ci/hud/low/1280x720.png': 'PNG' }, '2026-02-01T00:00:00Z');
      repo.commit({ 'index.html': '<html>v2</html>' }, '2026-03-01T00:00:00Z');
      const before = execFileSync('git', ['status', '--porcelain'], { cwd: repo.root, encoding: 'utf8' });
      runCheck(repo.root);
      const after = execFileSync('git', ['status', '--porcelain'], { cwd: repo.root, encoding: 'utf8' });
      expect(after).toBe(before);
    } finally {
      repo.cleanup();
    }
  });

  it('exposes a captured-surface glob set and the script uses the same pathspecs', () => {
    // Imported (not regex-matched) so the constant is a real dependency rather
    // than a string that happens to appear in the source.
    expect(CAPTURED_SURFACE_GLOBS).toEqual(['index.html', 'src/styles.css', 'src/rendering/**']);
    // The check script must use the same three pathspecs; it cannot import a
    // .ts module from plain node, so the parity is asserted here.
    const script = readSource(SCRIPT);
    for (const glob of CAPTURED_SURFACE_GLOBS) {
      expect(script).toContain(`'${glob}'`);
    }
  });
});
