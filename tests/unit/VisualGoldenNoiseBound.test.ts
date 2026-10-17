import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { comparePng } from '../visual/goldenCompare';
import { readSource } from '../support/sourceText';
import { resolve } from 'node:path';

/**
 * Tripwire for the documented per-cell noise bound (change 300).
 *
 * `render-world/high/1920x1080` is the only cell whose measured changed fraction
 * drifts with software-WebGL frame completion rather than with product pixels
 * (five consecutive captures on an unmodified build: 0, 0, 0, 0, 0.0201 against
 * the same baseline). It therefore gets an explicit bound instead of a raised
 * global threshold.
 *
 * This test proves the relaxation cannot hide a real regression: a synthetic
 * image above the bound must still FAIL. Without this proof, "documented bound"
 * would be an unverifiable claim.
 */

const SPEC = resolve(__dirname, '../../tests/e2e/visual-regression.spec.ts');

/** Build a solid-colour PNG of the given size. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** A PNG whose first `fraction` share of pixels differs from the base colour. */
function pngWithChangedFraction(
  width: number,
  height: number,
  changedFraction: number,
  base: [number, number, number] = [10, 20, 30],
  other: [number, number, number] = [200, 210, 220],
): Buffer {
  const png = new PNG({ width, height });
  const total = width * height;
  const changed = Math.round(total * changedFraction);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const n = y * width + x;
      const rgb = n < changed ? other : base;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('visual golden noise bound tripwire (300)', () => {
  const W = 200;
  const H = 100;
  // Mirror of the shipped bound. Kept in one place so raising the shipped value
  // without updating this file fails the first assertion below.
  const BOUND = 0.026;

  it('declares the documented bound and the family it covers', () => {
    const src = readSource(SPEC);
    expect(src).toContain(`export const UNSTABLE_CELL_NOISE_BOUND = ${BOUND};`);
    // The bound applies to the DOM-text-over-scene screens that were measured to
    // swing between runs, not to the whole matrix.
    for (const screen of ['render-world', 'hud', 'hotbar', 'crosshair', 'debug-overlay', 'start-overlay']) {
      expect(src, `noise family missing ${screen}`).toContain(`'${screen}'`);
    }
    // The bound must stay a small, explicit relaxation — never a global raise.
    expect(src).not.toMatch(/const PIXEL_DIFF = \{[^}]*maxChangedFraction: 0\.(0[3-9]|[1-9])/);
    expect(src).not.toMatch(/const CLIPPED_DIFF = \{[^}]*maxChangedFraction: 0\.(0[3-9]|[1-9])/);
  });

  it('a global (non-bound) comparison still fails above the 0.02 threshold', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    const actual = pngWithChangedFraction(W, H, 0.03);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.02 });
    expect(result.status).toBe('fail');
  });

  it('fails a synthetic image ABOVE the documented bound (tripwire)', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    // 0.05 changed is ~1.9x the documented bound: a real rendering regression in
    // a HUD cell would exceed it comfortably.
    const actual = pngWithChangedFraction(W, H, 0.05);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: BOUND });
    expect(result.status).toBe('fail');
    if (result.status !== 'fail') throw new Error('expected a fail result');
    expect(result.reason).toBe('exceeded-threshold');
    expect(result.changedFraction).toBeGreaterThan(BOUND);
  });

  it('passes a synthetic image ABOVE the old 0.02 threshold but under the bound', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    // 0.0253 is the worst fraction CI actually measured (hud/high/1280x720): it
    // must pass under the documented bound while still failing the global 0.02.
    const actual = pngWithChangedFraction(W, H, 0.0253);
    expect(comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: BOUND }).status).toBe('pass');
    expect(comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.02 }).status).toBe('fail');
  });

  it('keeps the bound narrow: it does not absorb a 2x-noise regression', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    const actual = pngWithChangedFraction(W, H, BOUND * 2);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: BOUND });
    expect(result.status).toBe('fail');
  });
});
