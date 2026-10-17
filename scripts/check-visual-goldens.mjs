#!/usr/bin/env node
/* global console, process */
/**
 * Visual-golden staleness check (change 300, audit finding F-003).
 *
 * A committed golden set must never silently predate a change to a captured
 * surface. This check compares, per golden environment directory:
 *
 *   newest commit touching `tests/visual-golden/<env>/**`
 *     versus
 *   newest CONTENT change touching any `CAPTURED_SURFACE_GLOBS` path
 *
 * and fails when the surfaces are newer. Comparisons use `git log -w`
 * (ignore-all-space) so a line-ending-only renormalisation commit — such as
 * change 298's — does not make every golden set spuriously stale.
 *
 * It is strictly READ-ONLY: it never writes a golden, never re-pins, and never
 * reads a PNG. Re-pinning remains an explicit human action through the capture
 * suite's documented `UPDATE_SNAPSHOTS=1` path.
 *
 * Usage:
 *   node scripts/check-visual-goldens.mjs [repoRoot]
 *   VISUAL_GOLDENS_ACKNOWLEDGED=<40-hex-sha> node scripts/check-visual-goldens.mjs
 *
 * Acknowledgement: a reviewed-and-pixel-neutral surface change may be recorded in
 * `tests/visual-golden/acknowledgements.json` as
 * `{ "<40-hex commit>": "<why the change cannot move a captured pixel>" }`.
 * That is the durable mechanism CI uses; an environment variable cannot persist
 * across runs. `VISUAL_GOLDENS_ACKNOWLEDGED=<sha>` also works for a one-off local
 * run. Both are honoured only for the exact newest committed-surface commit.
 *
 * Exit codes:
 *   0  every golden directory is fresh, or its staleness is acknowledged
 *   1  at least one golden directory is stale, or git cannot be queried
 *   2  a required golden directory is missing
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const goldenRoot = path.join(root, 'tests', 'visual-golden');

/** Captured-surface pathspecs; kept in lockstep with tests/visual/matrix.ts. */
const CAPTURED_SURFACES = ['index.html', 'src/styles.css', 'src/rendering/**'];

const FULL_SHA = /^[0-9a-f]{40}$/;

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/**
 * Newest commit (full sha + author date) that makes a REAL content change to any
 * of `pathspecs`.
 *
 * `git log -w` keeps commits whose whitespace-only changes were ignored, but it
 * still lists them with an empty numstat block. A line-ending-only commit such as
 * change 298's renormalisation therefore appears in the log while contributing no
 * changed lines. We walk `git log -w --numstat` and take the first commit with at
 * least one non-zero numstat row, so EOL-only commits are correctly skipped.
 *
 * Returns null when no commit with a real change matches (for example a shallow
 * clone).
 */
function newestContentCommit(pathspecs) {
  let out;
  try {
    out = git(['log', '-w', '--numstat', '--format=%H%x09%aI', '--', ...pathspecs]);
  } catch {
    return null;
  }
  let current = null;
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const header = /^([0-9a-f]{40})\t(.+)$/.exec(trimmed);
    if (header) {
      current = { sha: header[1], date: header[2] };
      continue;
    }
    const stat = /^(\d+|-)\t(\d+|-)\t/.exec(trimmed);
    if (stat && current) {
      const added = stat[1] === '-' ? 0 : Number(stat[1]);
      const removed = stat[2] === '-' ? 0 : Number(stat[2]);
      if (added > 0 || removed > 0) return current;
    }
  }
  return null;
}

/** The newest commit (any change) touching `pathspecs`. */
function newestCommit(pathspecs) {
  try {
    const out = git(['log', '-1', '--format=%H%x09%aI', '--', ...pathspecs]);
    if (!out) return null;
    const [sha, date] = out.split('\t');
    if (!FULL_SHA.test(sha) || !date) return null;
    return { sha, date };
  } catch {
    return null;
  }
}

/**
 * Whether the checkout has usable history.
 *
 * A shallow clone (GitHub Actions' default `fetch-depth: 1`) has exactly one
 * commit, so EVERY path's newest commit is that same root commit. The staleness
 * comparison then always sees `golden.sha === surface.sha` and reports "fresh" no
 * matter what actually changed — the gate would pass vacuously in CI while
 * failing correctly on a full-history clone. That inversion was observed: CI
 * reported "fresh against 76159529" while a local full clone reported the same
 * tree as stale against 1c8908f.
 */
function isShallow() {
  try {
    return fs.readFileSync(path.join(root, '.git', 'shallow'), 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

/** The golden environment directories committed under tests/visual-golden. */
function goldenEnvironments() {
  let entries;
  try {
    entries = fs.readdirSync(goldenRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * The pure staleness decision, exported for unit testing: given the newest
 * golden commit and the newest captured-surface commit, decide freshness.
 */
export function decideStaleness(golden, surface, acknowledged) {
  if (!golden || !surface) {
    return { stale: false, reason: 'no-comparable-commits' };
  }
  if (golden.sha === surface.sha) {
    return { stale: false, reason: 'golden-is-newest' };
  }
  // Dates are ISO-8601 author dates; string order is chronological order.
  if (golden.date >= surface.date) {
    return { stale: false, reason: 'golden-newer-or-equal' };
  }
  if (acknowledged === surface.sha) {
    return { stale: false, reason: 'acknowledged' };
  }
  return { stale: true, reason: 'surface-newer' };
}

const environments = goldenEnvironments();
if (environments === null) {
  console.error(`Golden directory is missing: ${path.relative(root, goldenRoot)}`);
  process.exit(2);
}
if (environments.length === 0) {
  console.error(`Golden directory is empty: ${path.relative(root, goldenRoot)}`);
  process.exit(2);
}

// A shallow checkout cannot answer this question. Refuse loudly rather than
// reporting "fresh" from a single-commit history where every path trivially
// shares one commit (see isShallow).
if (isShallow()) {
  console.error(
    'Visual golden staleness cannot be evaluated on a shallow clone: with one commit ' +
      'every path resolves to the same root commit, so the check would always report ' +
      '"fresh". Fetch full history for this job (actions/checkout with ' +
      '`fetch-depth: 0`) and re-run.',
  );
  process.exit(2);
}

const surface = newestContentCommit(CAPTURED_SURFACES);
if (surface === null) {
  console.error('Cannot determine the newest captured-surface commit; refusing to report "fresh".');
  process.exit(1);
}

const ACK_FILE = path.join(goldenRoot, 'acknowledgements.json');

/** Committed, reviewable acknowledgements: { "<sha>": "<reason>" }. */
function readAcknowledgedCommits() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ACK_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [sha, reason] of Object.entries(parsed)) {
      if (FULL_SHA.test(sha) && typeof reason === 'string' && reason.trim().length > 0) out[sha] = reason;
    }
    return out;
  } catch {
    return {};
  }
}

const acknowledgedCommits = readAcknowledgedCommits();
const acknowledged = process.env.VISUAL_GOLDENS_ACKNOWLEDGED ?? '';
const stale = [];
let acknowledgedFor = null;

for (const env of environments) {
  const rel = path.join('tests', 'visual-golden', env);
  const golden = newestCommit([`${rel}/**`]);
  const ack = acknowledged || (Object.prototype.hasOwnProperty.call(acknowledgedCommits, surface.sha) ? surface.sha : '');
  const decision = decideStaleness(golden, surface, ack);
  if (decision.stale) stale.push({ env, golden });
  if (decision.reason === 'acknowledged') acknowledgedFor = surface.sha;
}

if (stale.length > 0) {
  console.error('Visual goldens are stale relative to a captured surface:');
  console.error(`  newest captured-surface commit: ${surface.sha} (${surface.date})`);
  for (const entry of stale) {
    const where = entry.golden ? `${entry.golden.sha} (${entry.golden.date})` : '<no commit>';
    console.error(`  tests/visual-golden/${entry.env}: pinned at ${where}`);
  }
  console.error('Re-pin through the capture suite\'s canonical path: UPDATE_SNAPSHOTS=1 npm run test:e2e');
  if (acknowledged) {
    console.error(
      `VISUAL_GOLDENS_ACKNOWLEDGED="${acknowledged}" does not match ${surface.sha}; only the exact commit may be acknowledged.`,
    );
  }
  console.error(
    `To accept this as pixel-neutral, add "${surface.sha}" with a reason to tests/visual-golden/acknowledgements.json.`,
  );
  process.exit(1);
}

console.log(
  `Visual goldens are fresh against captured surface ${surface.sha} (${surface.date}); ` +
    `${environments.length} environment set(s) checked${acknowledgedFor ? ', one acknowledged' : ''}.`,
);
process.exit(0);
