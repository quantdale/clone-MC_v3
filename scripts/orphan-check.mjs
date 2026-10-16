/* global console */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve('.');
const srcFiles = execSync('git ls-files src', { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

// Build a set of import specifiers per file
const importRe = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;
const allImports = new Set();
for (const f of srcFiles.concat(execSync('git ls-files tests', {cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).filter(f=>f.endsWith('.ts'))) ) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = importRe.exec(txt))) allImports.add(m[1]);
}

function resolveImport(imp, fromFile) {
  if (!imp.startsWith('.')) return null; // node_modules or bare
  const base = path.resolve(path.dirname(fromFile), imp);
  // try .ts
  if (fs.existsSync(base + '.ts')) return base + '.ts';
  if (fs.existsSync(path.join(base, 'index.ts'))) return path.join(base, 'index.ts');
  return null;
}

// For each src file, is it imported (resolved) by anyone?
const importers = new Map();
for (const f of srcFiles.concat(execSync('git ls-files tests',{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).filter(f=>f.endsWith('.ts')))) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = importRe.exec(txt))) {
    const r = resolveImport(m[1], f);
    if (r && r.startsWith(path.join(root,'src'))) {
      importers.set(r, (importers.get(r)||0)+1);
    }
  }
}

const orphans = [];
for (const f of srcFiles) {
  const abs = path.resolve(f);
  if (!importers.has(abs)) {
    // entry points: main.ts is loaded by index.html; config files may be referenced by vite/tsconfig
    orphans.push(f);
  }
}
console.log('Source files:', srcFiles.length);
console.log('Files with zero internal importers (potential entry/dormant):', orphans.length);
for (const o of orphans) console.log('  -', o);
