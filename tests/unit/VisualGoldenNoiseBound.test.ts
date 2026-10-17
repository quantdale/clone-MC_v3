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

  it('declares the documented bound and the exact cell it covers', () => {
    const src = readSource(SPEC);
    expect(src).toMatch(/export const UNSTABLE_CELL_NOISE_BOUND = 0\.022;/);
    expect(src).toMatch(/screen: 'render-world', quality: 'high', resolution: '1920x1080'/);
    // The bound must stay a small, explicit relaxation — never a threshold raise.
    expect(src).toMatch(/UNSTABLE_CELL_NOISE_BOUND/);
    expect(src).not.toMatch(/maxChangedFraction: 0\.(0[3-9]|[1-9])/);
  });

  it('a global (non-bound) comparison still fails above the 0.02 threshold', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    const actual = pngWithChangedFraction(W, H, 0.03);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.02 });
    expect(result.status).toBe('fail');
  });

  it('fails a synthetic image ABOVE the documented bound (tripwire)', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    // 0.05 changed is ~2.3x the documented 0.022 bound: a real rendering
    // regression would exceed it comfortably.
    const actual = pngWithChangedFraction(W, H, 0.05);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.022 });
    expect(result.status).toBe('fail');
    if (result.status !== 'fail') throw new Error('expected a fail result');
    expect(result.reason).toBe('exceeded-threshold');
    expect(result.changedFraction).toBeGreaterThan(0.022);
  });

  it('passes a synthetic image AT the measured noise level', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    // 0.0201 is the worst fraction observed across five unmodified captures.
    const actual = pngWithChangedFraction(W, H, 0.0201);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.022 });
    expect(result.status).toBe('pass');
  });

  it('keeps the bound narrow: it does not absorb a 2x-noise regression', () => {
    const golden = solidPng(W, H, [10, 20, 30]);
    const actual = pngWithChangedFraction(W, H, 0.044);
    const result = comparePng(actual, golden, { channelTolerance: 24, maxChangedFraction: 0.022 });
    expect(result.status).toBe('fail');
  });
});
