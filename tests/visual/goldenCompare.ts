/**
 * Pure, headless-safe PNG comparison for the visual-regression harness.
 *
 * Two modes selected by thresholds: exact (byte-identical PNGs equal; any pixel
 * difference fails) and pixel-diff (equal iff the fraction of pixels where any
 * channel differs by more than a channel tolerance is at most the max changed
 * fraction). Comparison outcomes are returned as structured results, never
 * thrown; fully deterministic (no Date, no Math.random, no global state).
 */

import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

export interface CompareOptions {
  readonly channelTolerance: number;
  readonly maxChangedFraction: number;
}

export type CompareResult =
  | { readonly status: 'pass'; readonly mode: 'exact' | 'pixel-diff'; readonly changedFraction: 0 }
  | {
      readonly status: 'pass';
      readonly mode: 'pixel-diff';
      readonly changedFraction: number;
      readonly changedPixels: number;
    }
  | {
      readonly status: 'fail';
      readonly reason: 'dimension-mismatch' | 'exceeded-threshold' | 'decode-error';
      readonly changedFraction?: number;
      readonly changedPixels?: number;
    }
  | { readonly status: 'missing-golden' };

/** Exact mode: zero channel tolerance and a zero changed-fraction bound. */
function isExactMode(opts: CompareOptions): boolean {
  return opts.channelTolerance === 0 && opts.maxChangedFraction === 0;
}

function decodePng(buffer: Buffer): PNG | null {
  try {
    return PNG.sync.read(buffer);
  } catch {
    return null;
  }
}

/**
 * Compares an actual PNG buffer against a golden PNG buffer. Never throws:
 * malformed input yields a `decode-error` failure, a null golden yields
 * `missing-golden`, and mismatched dimensions short-circuit before any
 * per-pixel work.
 */
export function comparePng(actualPng: Buffer, goldenPng: Buffer | null, opts: CompareOptions): CompareResult {
  if (goldenPng === null) {
    return { status: 'missing-golden' };
  }

  // Byte-identity fast path: always a pass regardless of mode, before decoding.
  const exact = isExactMode(opts);
  if (actualPng.equals(goldenPng)) {
    return { status: 'pass', mode: exact ? 'exact' : 'pixel-diff', changedFraction: 0 };
  }

  const actual = decodePng(actualPng);
  const golden = decodePng(goldenPng);
  if (actual === null || golden === null) {
    return { status: 'fail', reason: 'decode-error' };
  }
  if (actual.width !== golden.width || actual.height !== golden.height) {
    return { status: 'fail', reason: 'dimension-mismatch' };
  }

  const totalPixels = actual.width * actual.height;
  const tolerance = opts.channelTolerance;
  const a = actual.data;
  const g = golden.data;
  let changedPixels = 0;
  for (let i = 0; i < totalPixels * 4; i += 4) {
    if (
      Math.abs(a[i]! - g[i]!) > tolerance ||
      Math.abs(a[i + 1]! - g[i + 1]!) > tolerance ||
      Math.abs(a[i + 2]! - g[i + 2]!) > tolerance ||
      Math.abs(a[i + 3]! - g[i + 3]!) > tolerance
    ) {
      changedPixels += 1;
    }
  }

  if (changedPixels === 0) {
    return { status: 'pass', mode: exact ? 'exact' : 'pixel-diff', changedFraction: 0 };
  }
  const changedFraction = changedPixels / totalPixels;
  if (changedFraction <= opts.maxChangedFraction) {
    return { status: 'pass', mode: 'pixel-diff', changedFraction, changedPixels };
  }
  return { status: 'fail', reason: 'exceeded-threshold', changedFraction, changedPixels };
}

/**
 * Writes a diff artifact for a failed comparison: changed pixels (any channel
 * differing by more than 0) are red, unchanged pixels are transparent black.
 * Only called by the harness on failure; both images must decode and match
 * dimensions.
 */
export function writeDiffPng(actual: Buffer, golden: Buffer, outPath: string): void {
  const actualPng = PNG.sync.read(actual);
  const goldenPng = PNG.sync.read(golden);
  if (actualPng.width !== goldenPng.width || actualPng.height !== goldenPng.height) {
    throw new Error(
      `writeDiffPng dimension mismatch: ${actualPng.width}x${actualPng.height} vs ${goldenPng.width}x${goldenPng.height}`,
    );
  }
  const diff = new PNG({ width: actualPng.width, height: actualPng.height });
  const a = actualPng.data;
  const g = goldenPng.data;
  const d = diff.data;
  d.fill(0);
  for (let i = 0; i < d.length; i += 4) {
    if (
      Math.abs(a[i]! - g[i]!) > 0 ||
      Math.abs(a[i + 1]! - g[i + 1]!) > 0 ||
      Math.abs(a[i + 2]! - g[i + 2]!) > 0 ||
      Math.abs(a[i + 3]! - g[i + 3]!) > 0
    ) {
      d[i] = 255;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }
  }
  writeFileSync(outPath, PNG.sync.write(diff));
}
