#!/usr/bin/env node
/* global console, process */
/**
 * Deterministic state-integrity validator for PROGRAM_STATE.json and PROGRAM_STATE.md.
 * Checks:
 * 1. JSON and Markdown agree on last completed change, current change, next change, status.
 * 2. No illegal active-change states (e.g., a change marked VERIFIED while advancement not allowed, unless blocked by hardening interlock).
 * 3. No impossible VERIFIED claims (e.g., VERIFIED but required tests not pass).
 * 4. Hardening interlock precedence: if interlock is not VERIFIED, advancement to 241+ must be blocked.
 *
 * Exit code 0 if valid, 1 if invalid.
 *
 * Run with: node scripts/validate-state.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_JSON = path.resolve(__dirname, '../openspec/PROGRAM_STATE.json');
const STATE_MD = path.resolve(__dirname, '../openspec/PROGRAM_STATE.md');
const HARDENING_DIR = path.resolve(__dirname, '../openspec/hardening/2026-08-17-pre-241-repository-hardening');
const HARDENING_VERIFICATION = path.resolve(HARDENING_DIR, 'verification.md');

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

  // 4. Hardening interlock precedence
  if (!hardeningVerified) {
    const nextNumber = extractChangeNumber(json.nextChange);
    if (nextNumber && nextNumber >= 241) {
      if (json.advancementAllowed) {
        errors.push(`Hardening interlock not VERIFIED but advancementAllowed is true and nextChange is ${json.nextChange}`);
      }
    }
  }

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
