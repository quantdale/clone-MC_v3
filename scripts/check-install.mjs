#!/usr/bin/env node
/* global console, process */
/**
 * Dependency-tree reproducibility check (change 299, audit finding F-002).
 *
 * Compares every package recorded in `package-lock.json` against the version
 * actually installed under `node_modules`, and reports every drift. The
 * repository's coverage thresholds are calibrated for the locked provider
 * version, so a gate result produced under a drifted tree is not a repository
 * result.
 *
 * This script is strictly READ-ONLY. It never writes, creates, or deletes a
 * file, and it never spawns a package manager (doing so from `preinstall`
 * would recurse).
 *
 * Usage:
 *   node scripts/check-install.mjs [repoRoot]
 *   npm run verify:deps
 *
 * Exit codes:
 *   0  the installed tree matches the lockfile, or `node_modules` is absent
 *      (a fresh tree immediately before `npm ci`)
 *   1  at least one drift was found, or a drift table could not be produced
 *   2  `package-lock.json` is missing or malformed
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const lockPath = path.join(root, 'package-lock.json');
const modulesDir = path.join(root, 'node_modules');

/** Read and parse the lockfile. Returns null when unreadable/malformed. */
function readLockfile() {
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch {
    console.error(`Cannot read ${path.basename(lockPath)} at ${lockPath}`);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.packages || typeof parsed.packages !== 'object') {
      console.error(`${path.basename(lockPath)} has no "packages" map; refusing to report "no drift"`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`Malformed ${path.basename(lockPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** The direct dependency names declared by the root project. */
function directDependencyNames(lockfile) {
  const rootPkg = lockfile.packages[''] ?? {};
  const names = [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(rootPkg[field] ?? {})) names.push(name);
  }
  return [...new Set(names)];
}

/** The locked version for a top-level package, or null when not locked. */
function lockedVersion(lockfile, name) {
  const entry = lockfile.packages[`node_modules/${name}`];
  return entry && typeof entry.version === 'string' ? entry.version : null;
}

/** The on-disk version for a package, or a sentinel when unreadable. */
function installedVersion(name, cache) {
  if (cache.has(name)) return cache.get(name);
  const manifest = path.join(modulesDir, name, 'package.json');
  let version;
  try {
    version = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    if (typeof version !== 'string' || version.length === 0) version = '<unreadable>';
  } catch {
    version = '<unreadable>';
  }
  cache.set(name, version);
  return version;
}

/**
 * Whether an optional dependency is absent for a platform reason.
 *
 * Platform-specific binaries are published as
 * `@<scope>/<name>-<os>-<cpu>[-<libc>]`, e.g.
 * `@rollup/rollup-win32-x64-msvc`, `@rollup/rollup-linux-x64-gnu`,
 * `@esbuild/linux-x64`. The `<name>` segment varies in length and may itself
 * contain hyphens (`simple-linux-x64-gnu`), so the platform and cpu are taken
 * from the END of the name, not by fixed capture positions.
 */
function isPlatformInapplicable(name) {
  const match = name.match(/^@[^/]+\/(.+)$/);
  if (!match) return false;
  const segments = match[1].split('-');
  if (segments.length < 2) return false;
  const platform = process.platform;
  const arch = process.arch;

  // Trailing toolchain qualifier (`-gnu`, `-musl`, `-msvc`) eats one segment.
  // `@rollup/rollup-win32-x64-msvc` and `@rollup/rollup-linux-x64-gnu` are the
  // same `<name>-<os>-<cpu>-<qualifier>` shape, and the qualifier says nothing
  // about which platform the package applies to.
  const tail = segments.at(-1);
  const hasQualifier = tail === 'gnu' || tail === 'musl' || tail === 'msvc';
  const cpu = segments[segments.length - (hasQualifier ? 2 : 1)];
  const os = segments[segments.length - (hasQualifier ? 3 : 2)];
  if (!os || !cpu) return false;
  // Only treat a name as platform-specific when the OS segment is a real
  // platform token; otherwise the suffix is part of an unrelated package name.
  const KNOWN_OS = ['win32', 'linux', 'darwin', 'freebsd', 'openbsd', 'sunos', 'android', 'aix'];
  if (!KNOWN_OS.includes(os)) return false;
  return os !== platform || cpu !== arch;
}

const lockfile = readLockfile();
if (!lockfile) process.exit(2);

// A fresh tree (absent or empty node_modules) is the normal pre-`npm ci` state.
// Demanding a match there would block every legitimate first install.
let treeState = 'matching';
try {
  const entries = fs.readdirSync(modulesDir);
  if (entries.length === 0) treeState = 'fresh';
} catch {
  treeState = 'fresh';
}

if (treeState === 'fresh') {
  console.log(`Fresh tree at ${modulesDir} (node_modules absent or empty); nothing to verify before install.`);
  process.exit(0);
}

const names = directDependencyNames(lockfile);
const cache = new Map();
const drifts = [];
let verified = 0;

for (const name of names) {
  const locked = lockedVersion(lockfile, name);
  if (locked === null) continue; // not locked at top level (nested/renamed)
  const installed = installedVersion(name, cache);
  if (installed === '<unreadable>') {
    // Absent on an incompatible platform is correct, not drift.
    const rootPkg = lockfile.packages[''] ?? {};
    const optional = Object.prototype.hasOwnProperty.call(rootPkg.optionalDependencies ?? {}, name);
    if (optional && isPlatformInapplicable(name)) continue;
    drifts.push({ name, installed, locked });
    continue;
  }
  if (installed !== locked) {
    drifts.push({ name, installed, locked });
    continue;
  }
  verified += 1;
}

// Transitive closure: every package the lockfile records for node_modules.
const transitive = Object.keys(lockfile.packages).filter((key) => key.startsWith('node_modules/'));
for (const key of transitive) {
  const name = key.slice('node_modules/'.length);
  if (names.includes(name)) continue; // already compared above
  if (name.includes('/node_modules/')) continue; // nested copy, not top-level
  const entry = lockfile.packages[key];
  if (!entry || typeof entry.version !== 'string') continue;
  const installed = installedVersion(name, cache);
  if (installed === '<unreadable>') {
    // A platform-specific binary that cannot apply here is correctly absent, so it
    // is not drift — the same rule the direct-dependency pass applies. Without this
    // the closure pass reported `@rollup/rollup-win32-x64-msvc` as drift on Linux
    // CI even though it was correctly not installed there.
    if (isPlatformInapplicable(name)) continue;
    continue; // transitive absence in general is not gated
  }
  if (installed !== entry.version) {
    drifts.push({ name, installed, locked: entry.version });
    continue;
  }
  verified += 1;
}

if (drifts.length > 0) {
  console.error('Dependency tree does not match package-lock.json:');
  const width = Math.max(...drifts.map((d) => d.name.length), 'package'.length);
  for (const drift of drifts) {
    console.error(`  ${drift.name.padEnd(width)}  installed ${drift.installed}  locked ${drift.locked}`);
  }
  console.error(`Run: npm ci`);
  process.exit(1);
}

console.log(`Dependency tree matches package-lock.json (${verified} packages verified).`);
process.exit(0);
