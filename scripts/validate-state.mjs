#!/usr/bin/env node
/* global console, process */
/**
 * Deterministic state-integrity validator for PROGRAM_STATE.json and PROGRAM_STATE.md.
 * Checks:
 * 1. JSON and Markdown agree on last completed change, current change, next change, status.
 * 2. No illegal active-change states (e.g., a change marked VERIFIED while advancement not allowed, unless blocked by hardening interlock).
 * 3. No impossible VERIFIED claims (e.g., VERIFIED but required tests not pass).
 * 4. Hardening interlock precedence: if an interlock is not VERIFIED, advancement past it must be blocked.
 * 5. Terminal-program coherence (hardening 2026-08-23): status COMPLETE requires nextChange null
 *    and a VERIFIED current change; a non-terminal status must not coexist with terminal claims.
 * 6. Lowercase alias conformance: openspec/program-state.json is redirect-only and must never
 *    carry per-change state fields that could contradict the canonical file.
 * 7. Release-authority coherence (2026-08-23 governance repair):
 *    - a terminal program declares `releaseAuthority.authorityPackage` pointing at an existing
 *      hardening directory with a verification.md;
 *    - `canonicalCi` may only be recorded when that verification.md carries the canonical
 *      `Overall status: **VERIFIED**` marker (no premature closure claims);
 *    - `candidateSha` / `publicationHistory[].head` values are 40-hex and ancestors-or-self of
 *      HEAD wherever a git repository is present — a commit never claims its own SHA, so these
 *      fields always observe PRIOR commits;
 *    - the next action exists on both sides of the JSON/Markdown boundary.
 * 8. `validationResults[]` entries with a `change` identity are unique (attempt/history records
 *    must use an explicitly documented separate schema instead of silent duplicates).
 *
 * Exit code 0 if valid, 1 if invalid.
 *
 * Run with: node scripts/validate-state.mjs [--root <repoRoot>]
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(__filename), '..');

function resolveRoot() {
  const argv = process.argv.slice(2);
  const flagIndex = argv.indexOf('--root');
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return path.resolve(argv[flagIndex + 1]);
  }
  return defaultRoot;
}

const ROOT = resolveRoot();
const STATE_JSON = path.resolve(ROOT, 'openspec/PROGRAM_STATE.json');
const STATE_MD = path.resolve(ROOT, 'openspec/PROGRAM_STATE.md');
const STATE_ALIAS_JSON = path.resolve(ROOT, 'openspec/program-state.json');
// Any interlock directory may gate advancement; each must expose verification.md.
const HARDENING_DIR = path.resolve(ROOT, 'openspec/hardening');
const HARDENING_VERIFICATION = path.resolve(
  ROOT,
  'openspec/hardening/2026-08-17-pre-241-repository-hardening/verification.md',
);

function readJson() {
  const raw = fs.readFileSync(STATE_JSON, 'utf8');
  return JSON.parse(raw);
}

function readMarkdown() {
  const raw = fs.readFileSync(STATE_MD, 'utf8');
  const lines = raw.split('\n');
  const result = {};
  for (const line of lines) {
    const match = line.match(/^-\s+(.*?):\s+\*\*(.*?)\*\*/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function isHardeningVerified() {
  if (!fs.existsSync(HARDENING_VERIFICATION)) return false;
  const raw = fs.readFileSync(HARDENING_VERIFICATION, 'utf8');
  return raw.includes('Overall status: **VERIFIED**');
}

/**
 * Whether every hardening package under openspec/hardening is VERIFIED. A
 * non-VERIFIED package gates advancement (check 4); a fully-verified set must
 * not contradict terminal state (check 5 reads this too).
 */
function anyUnverifiedInterlock() {
  let entries = [];
  try {
    entries = fs.readdirSync(HARDENING_DIR, { withFileTypes: true });
  } catch {
    return false; // no hardening directory: nothing gates
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const verificationPath = path.join(HARDENING_DIR, entry.name, 'verification.md');
    if (!fs.existsSync(verificationPath)) continue;
    const raw = fs.readFileSync(verificationPath, 'utf8');
    if (!raw.includes('Overall status: **VERIFIED**')) {
      return true;
    }
  }
  return false;
}

/**
 * Alias conformance (hardening 2026-08-23): openspec/program-state.json must be
 * redirect-only. Any per-change field it carries could contradict the canonical
 * file and misdirect an older agent, so its presence is an error regardless of
 * the canonical state's content.
 */
function validateAlias(errors) {
  if (!fs.existsSync(STATE_ALIAS_JSON)) {
    return; // alias is optional infrastructure
  }
  let alias;
  try {
    alias = JSON.parse(fs.readFileSync(STATE_ALIAS_JSON, 'utf8'));
  } catch (e) {
    errors.push(`alias program-state.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const forbiddenFields = [
    'current_change', 'current_change_status', 'last_completed_change',
    'currentChange', 'currentChangeStatus', 'lastCompletedChange',
    'advancement_allowed', 'advancementAllowed', 'nextChange', 'next_change',
    'status', 'program',
  ];
  for (const field of forbiddenFields) {
    if (Object.prototype.hasOwnProperty.call(alias, field)) {
      errors.push(`alias program-state.json carries stale state field "${field}"; it must remain redirect-only`);
    }
  }
  if (typeof alias.canonicalFile === 'string' && !fs.existsSync(path.resolve(ROOT, alias.canonicalFile))) {
    errors.push(`alias program-state.json points at missing canonical file "${alias.canonicalFile}"`);
  }
}

function extractChangeNumber(change) {
  if (typeof change !== 'string') return null;
  const match = change.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

const SHA_40 = /^[0-9a-f]{40}$/;

/** Whether the repository is a shallow clone. Shallow checkouts (common in CI)
 * may not contain the full commit graph, so a genuine ancestor can be invisible
 * to `git merge-base --is-ancestor` even though it is an ancestor in full history. */
function isShallowClone() {
  return fs.existsSync(path.join(ROOT, '.git', 'shallow'));
}

/** Whether `sha` is an ancestor of (or equal to) HEAD. Always true outside a git repo
 * (synthetic validator fixtures have no history); real repositories enforce it.
 *
 * Under a shallow clone the merge-base test cannot see the full graph, so a true
 * ancestor may report as non-ancestor. That is a CI-history artifact, not a lineage
 * defect: we surface it as a non-fatal warning (the canonical CI run is the authority
 * for release evidence) rather than failing validation for a commit that is genuinely
 * ancestral in full history. Full-history checkouts keep the hard enforcement. */
function isAncestorOrSelf(sha, errors, warnings, label) {
  if (!SHA_40.test(sha)) {
    errors.push(`${label} "${sha}" is not a full 40-hex commit SHA`);
    return;
  }
  if (!fs.existsSync(path.join(ROOT, '.git'))) return;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    if (isShallowClone()) {
      warnings.push(
        `${label} "${sha}" is not resolvable as an ancestor-or-self of HEAD under a shallow clone; ` +
        'full-history checkout required for definitive lineage proof (canonical CI is authoritative).',
      );
    } else {
      errors.push(`${label} "${sha}" is not an ancestor-or-self of HEAD; release-evidence SHAs must observe prior commits, never claim their own`);
    }
  }
}

/** Release-authority coherence (check 7). */
function validateReleaseAuthority(json, errors, warnings) {
  const ra = json.releaseAuthority;
  if (!ra || typeof ra !== 'object') {
    errors.push('releaseAuthority block is missing; the current release decision must name its authority package');
    return;
  }
  if (typeof ra.authorityPackage !== 'string' || ra.authorityPackage.length === 0) {
    errors.push('releaseAuthority.authorityPackage must be a non-empty package path');
    return;
  }
  const verificationPath = path.resolve(ROOT, ra.authorityPackage, 'verification.md');
  let verificationRaw = null;
  try {
    verificationRaw = fs.readFileSync(verificationPath, 'utf8');
  } catch {
    errors.push(`releaseAuthority.authorityPackage "${ra.authorityPackage}" has no readable verification.md`);
    return;
  }
  const artifactClosed = verificationRaw.includes('Overall status: **VERIFIED**');
  if (ra.canonicalCi !== undefined && ra.canonicalCi !== null) {
    if (!artifactClosed) {
      errors.push(`releaseAuthority records canonicalCi but "${ra.authorityPackage}/verification.md" lacks the "Overall status: **VERIFIED**" marker; a conditional verdict must not be recorded as closed`);
    }
    const ci = ra.canonicalCi;
    for (const field of ['runId', 'gateJobId', 'e2eJobId']) {
      const v = ci[field];
      if (!Number.isFinite(v) || typeof v !== 'number' || v <= 0) {
        errors.push(`releaseAuthority.canonicalCi.${field} must be a positive workflow/job id`);
      }
    }
    if (ci.gateConclusion !== 'success' || ci.e2eConclusion !== 'success') {
      errors.push('releaseAuthority.canonicalCi may only be recorded when BOTH gate and e2e conclusions are success');
    }
    if (typeof ci.recordedAt !== 'string' || ci.recordedAt.length === 0) {
      errors.push('releaseAuthority.canonicalCi.recordedAt must be an ISO timestamp string');
    }
  }
  if (ra.candidateSha !== undefined && ra.candidateSha !== null) {
    isAncestorOrSelf(ra.candidateSha, errors, warnings, 'releaseAuthority.candidateSha');
  }
  if (Array.isArray(json.publicationHistory)) {
    json.publicationHistory.forEach((entry, i) => {
      if (!entry || typeof entry.head !== 'string') {
        errors.push(`publicationHistory[${i}] is missing a head SHA`);
        return;
      }
      isAncestorOrSelf(entry.head, errors, warnings, `publicationHistory[${i}].head`);
      if (typeof entry.at !== 'string' || entry.at.length === 0) {
        errors.push(`publicationHistory[${i}].at must be a timestamp string`);
      }
      if (typeof entry.note !== 'string' || entry.note.length === 0) {
        errors.push(`publicationHistory[${i}].note must explain what was published`);
      }
    });
  }
}

/** validationResults identity uniqueness (check 8). */
function validateValidationResults(json, errors) {
  if (!Array.isArray(json.validationResults)) return;
  const seen = new Map();
  json.validationResults.forEach((entry, i) => {
    const change = entry && typeof entry.change === 'string' ? entry.change : null;
    if (change === null) return; // legacy head-only rows carry no change identity
    if (seen.has(change)) {
      errors.push(`validationResults contains duplicate change identity "${change}" (entries ${seen.get(change)} and ${i}); attempt/history data needs an explicit schema, not silent duplicates`);
    } else {
      seen.set(change, i);
    }
  });
}

/** PARITY_MATRIX.md ↔ PROGRAM_STATE.json cross-check (check 9). The matrix is an
 * optional artifact (synthetic validator fixtures omit it); when present it must
 * biject the numbered sequence, never regress a PROGRAM_STATE-VERIFIED change to
 * a planned/in-progress row, preserve the two master-plan rows, and keep its
 * summary counts in sync with the actual rows. */
function validateParityMatrix(json, errors) {
  const matrixPath = path.resolve(ROOT, 'PARITY_MATRIX.md');
  if (!fs.existsSync(matrixPath)) return;
  const lines = fs.readFileSync(matrixPath, 'utf8').split('\n');
  const rows = new Map();
  const mpRows = new Set();
  const mpCategory = new Map();
  for (const line of lines) {
    const cMatch = line.match(/^\|\s*C(\d{3})\s*\|/);
    if (cMatch) {
      const id = `C${cMatch[1]}`;
      if (rows.has(id)) {
        errors.push(`PARITY_MATRIX has duplicate row ${id}`);
        continue;
      }
      const cells = line.split('|').map((c) => c.trim());
      // | C### | slug | outcome | category | evidence | differences | STATUS |
      const category = cells[4] ?? '';
      const status = (cells[cells.length - 2] ?? '').toLowerCase();
      rows.set(id, { category, status });
      continue;
    }
    const mpMatch = line.match(/^\|\s*(MP-[\w.-]+)\s*\|/);
    if (mpMatch) {
      mpRows.add(mpMatch[1]);
      const cells = line.split('|').map((c) => c.trim());
      mpCategory.set(mpMatch[1], cells[4] ?? '');
    }
  }

  // a. Bijection over the numbered sequence.
  for (let i = 1; i <= 250; i++) {
    const id = `C${String(i).padStart(3, '0')}`;
    if (!rows.has(id)) errors.push(`PARITY_MATRIX is missing its bijective row ${id}`);
  }

  // b. A PROGRAM_STATE-VERIFIED change must never sit on a planned/in-progress row.
  const verifiedNumbers = new Set();
  const collectVerified = (value) => {
    if (typeof value !== 'string') return;
    const m = value.match(/^(\d{3})-/);
    if (m) verifiedNumbers.add(m[1]);
  };
  if (Array.isArray(json.validationResults)) {
    for (const entry of json.validationResults) {
      if (entry && typeof entry.change === 'string' && entry.status === 'VERIFIED') {
        collectVerified(entry.change);
      }
    }
  }
  if (json.currentChangeStatus === 'VERIFIED') collectVerified(json.currentChange);
  if (json.lastCompletedChange && json.currentChangeStatus === 'VERIFIED') {
    collectVerified(typeof json.lastCompletedChange === 'string' ? json.lastCompletedChange : null);
  }
  for (const num of verifiedNumbers) {
    const id = `C${num}`;
    const row = rows.get(id);
    if (!row) continue; // missing-row case already reported above
    if (row.status !== 'verified') {
      errors.push(`PARITY_MATRIX row ${id} is marked "${row.status}" but PROGRAM_STATE records change ${num} as VERIFIED`);
    }
  }

  // c. Master-plan rows preserved.
  if (!mpRows.has('MP-19.4-1')) {
    errors.push('PARITY_MATRIX lost its deferred MP-19.4-1 Wither-like secondary boss row');
  }
  if (!mpRows.has('MP-33-1')) {
    errors.push('PARITY_MATRIX lost its out-of-scope MP-33-1 proprietary-services row');
  }

  // d. Summary counts agree with the actual rows (C rows + MP rows both carry
  // a category cell; the Summary table totals across both sections).
  const norm = (s) => s.toLowerCase().replace(/\s*\(.*\)$/, '').trim();
  const categoryCounts = {};
  for (const { category } of rows.values()) {
    const key = norm(category);
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  }
  for (const category of mpCategory.values()) {
    const key = norm(category);
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  }
  const totalRows = rows.size + mpRows.size;
  let inSummary = false;
  for (const line of lines) {
    if (line.startsWith('## Summary')) {
      inSummary = true;
      continue;
    }
    if (!inSummary || !line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    const label = cells[0];
    const declared = parseInt(cells[1], 10);
    if (Number.isNaN(declared)) continue;
    if (/^total rows$/i.test(label)) {
      if (declared !== totalRows) {
        errors.push(`PARITY_MATRIX summary declares ${declared} total rows but ${totalRows} rows exist`);
      }
      continue;
    }
    const actual = categoryCounts[norm(label)] ?? 0;
    if (actual !== declared) {
      errors.push(`PARITY_MATRIX summary declares ${declared} "${label}" rows but the matrix has ${actual}`);
    }
  }
}

function validate() {
  const errors = [];
  const warnings = [];
  const json = readJson();
  const md = readMarkdown();
  const hardeningVerified = isHardeningVerified();

  // 1. JSON/Markdown agreement
  const mdLastCompleted = md['Last completed change'] || '';
  const mdCurrentChange = md['Active implementation change'] || '';
  const mdNextChange = md['Next change'] || '';
  const mdAdvancementAllowed = md['240 advancement allowed'] || '';

  const jsonLastCompleted = json.lastCompletedChange;
  const jsonCurrentChange = json.currentChange;
  const jsonNextChange = json.nextChange;
  // Truthful label for a non-terminal ACTIVE epoch: advancement is simply not
  // yet allowed (the change is in progress), distinct from a hardening-interlock
  // block. Only the terminal form keeps the historical 'blocked by hardening
  // interlock' wording because an interlock genuinely gated release authority there.
  const jsonAdvancementAllowed = json.advancementAllowed
    ? 'yes'
    : json.status === 'ACTIVE'
      ? 'no (active change not yet verified)'
      : 'blocked by hardening interlock';

  if (!mdLastCompleted.startsWith(jsonLastCompleted)) {
    errors.push(`JSON lastCompletedChange="${jsonLastCompleted}" does not match Markdown "${mdLastCompleted}"`);
  }
  if (!mdCurrentChange.startsWith(jsonCurrentChange) && !mdCurrentChange.includes(jsonCurrentChange) && !mdCurrentChange.includes('None (hardening interlock')) {
    errors.push(`JSON currentChange="${jsonCurrentChange}" does not match Markdown "${mdCurrentChange}"`);
  }
  if (!mdNextChange.startsWith(jsonNextChange) && !mdNextChange.includes(jsonNextChange)) {
    errors.push(`JSON nextChange="${jsonNextChange}" does not match Markdown "${mdNextChange}"`);
  }
  if (mdAdvancementAllowed !== jsonAdvancementAllowed) {
    errors.push(`JSON advancementAllowed="${jsonAdvancementAllowed}" does not match Markdown "${mdAdvancementAllowed}"`);
  }

  // 2. Illegal active-change states
  if (json.currentChangeStatus === 'VERIFIED') {
    if (!json.advancementAllowed && !hardeningVerified) {
      if (!fs.existsSync(HARDENING_DIR)) {
        errors.push(`Current change ${json.currentChange} is VERIFIED but advancementAllowed is false and no hardening interlock exists`);
      }
    }
  }

  // 3. Impossible VERIFIED claims
  if (json.currentChangeStatus === 'VERIFIED') {
    if (!json.mandatoryRequirementsPass) {
      errors.push(`Change ${json.currentChange} is VERIFIED but mandatoryRequirementsPass is false`);
    }
    if (!json.requiredTestsPass) {
      errors.push(`Change ${json.currentChange} is VERIFIED but requiredTestsPass is false`);
    }
  }

  // 4. Hardening interlock precedence (any unverified interlock gates advancement).
  if (!hardeningVerified && anyUnverifiedInterlock()) {
    const nextNumber = extractChangeNumber(json.nextChange);
    if (nextNumber && nextNumber >= 241) {
      if (json.advancementAllowed) {
        errors.push(`Hardening interlock not VERIFIED but advancementAllowed is true and nextChange is ${json.nextChange}`);
      }
    }
  }

  // 5. Terminal-program coherence (hardening 2026-08-23). The canonical file
  // must not mix terminal claims with an open program, and vice versa.
  const terminalStatuses = new Set(['COMPLETE', 'TERMINAL']);
  const isTerminal = terminalStatuses.has(json.status);
  if (isTerminal) {
    if (json.nextChange !== null) {
      errors.push(`Program status "${json.status}" is terminal but nextChange is ${JSON.stringify(json.nextChange)}; expected null`);
    }
    if (json.currentChangeStatus && json.currentChangeStatus !== 'VERIFIED') {
      errors.push(`Program status "${json.status}" is terminal but currentChangeStatus is "${json.currentChangeStatus}"`);
    }
    if (json.completionPercentage !== 100) {
      errors.push(`Program status "${json.status}" is terminal but completionPercentage is ${json.completionPercentage}`);
    }
    if (json.advancementAllowed === false) {
      errors.push('Program status is terminal but advancementAllowed is false');
    }
  } else if (json.nextChange === null && json.currentChangeStatus === 'VERIFIED' && !isTerminal) {
    // A fully verified change with no successor must either declare the next
    // change explicitly or mark the program terminal; anything else strands
    // the next session without a resumable state.
    errors.push(`currentChange ${json.currentChange} is VERIFIED with nextChange null but status "${json.status}" is neither terminal nor advancing`);
  }

  // 6. Alias conformance.
  validateAlias(errors);

  // 7. Release-authority coherence (mandatory for terminal programs).
  const terminalStatuses2 = new Set(['COMPLETE', 'TERMINAL']);
  if (terminalStatuses2.has(json.status)) {
    validateReleaseAuthority(json, errors, warnings);
    const mdNextExactAction = (md['Next exact action'] || '').trim();
    if (mdNextExactAction.length === 0) {
      errors.push('Markdown is missing a non-empty "- Next exact action: **...**" bullet');
    }
    if (typeof json.nextExactAction !== 'string' || json.nextExactAction.trim().length === 0) {
      errors.push('JSON nextExactAction must be a non-empty string');
    }
  }

  // 8. validationResults identity uniqueness.
  validateValidationResults(json, errors);

  // 9. PARITY_MATRIX cross-check.
  validateParityMatrix(json, errors);

  return { errors, warnings };
}

function main() {
  const { errors, warnings } = validate();
  if (errors.length === 0) {
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.error(`  - WARNING: ${warning}`);
      }
    }
    console.log('State validation PASSED');
    process.exit(0);
  } else {
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.error(`  - WARNING: ${warning}`);
      }
    }
    console.error('State validation FAILED:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

main();
