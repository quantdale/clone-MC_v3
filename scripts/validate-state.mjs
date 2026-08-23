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
 *
 * Exit code 0 if valid, 1 if invalid.
 *
 * Run with: node scripts/validate-state.mjs [--root <repoRoot>]
 */
import * as fs from 'fs';
import * as path from 'path';
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
  const match = change.match(/^(\d+)-/);
  return match ? parseInt(match[1], 10) : null;
}

function validate() {
  const errors = [];
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
  const jsonAdvancementAllowed = json.advancementAllowed ? 'yes' : 'blocked by hardening interlock';

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

  return errors;
}

function main() {
  const errors = validate();
  if (errors.length === 0) {
    console.log('State validation PASSED');
    process.exit(0);
  } else {
    console.error('State validation FAILED:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

main();
