import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { comparePng, writeDiffPng, type CompareOptions } from '../visual/goldenCompare';

type Rgba = readonly [number, number, number, number];

const EXACT: CompareOptions = { channelTolerance: 0, maxChangedFraction: 0 };

/** Builds a solid-color PNG of the given dimensions. */
function makePng(width: number, height: number, fill: Rgba): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = fill[0];
    png.data[i * 4 + 1] = fill[1];
    png.data[i * 4 + 2] = fill[2];
    png.data[i * 4 + 3] = fill[3];
  }
  return png;
}

function clonePng(png: PNG): PNG {
  const copy = new PNG({ width: png.width, height: png.height });
  copy.data.set(png.data);
  return copy;
}

function pack(png: PNG): Buffer {
  return PNG.sync.write(png);
}

describe('exact mode', () => {
  it('passes byte-identical buffers with an exact-mode result', () => {
    const buffer = pack(makePng(20, 20, [10, 20, 30, 255]));
    expect(comparePng(buffer, buffer, EXACT)).toEqual({
      status: 'pass',
      mode: 'exact',
      changedFraction: 0,
    });
  });

  it('passes independently packed identical images byte-for-byte', () => {
    const actual = pack(makePng(20, 20, [10, 20, 30, 255]));
    const golden = pack(makePng(20, 20, [10, 20, 30, 255]));
    expect(actual.equals(golden)).toBe(true);
    expect(comparePng(actual, golden, EXACT)).toEqual({
      status: 'pass',
      mode: 'exact',
      changedFraction: 0,
    });
  });

  it('passes byte-identical buffers in pixel-diff mode too', () => {
    const buffer = pack(makePng(20, 20, [10, 20, 30, 255]));
    expect(comparePng(buffer, buffer, { channelTolerance: 4, maxChangedFraction: 0.05 })).toEqual({
      status: 'pass',
      mode: 'pixel-diff',
      changedFraction: 0,
    });
  });

  it('fails when exactly one pixel differs by one channel value', () => {
    const base = makePng(20, 20, [10, 20, 30, 255]);
    const modified = clonePng(base);
    modified.data[4 * 4 + 1] = 21; // pixel 4, green channel +1
    const result = comparePng(pack(base), pack(modified), EXACT);
    expect(result).toEqual({
      status: 'fail',
      reason: 'exceeded-threshold',
      changedFraction: 1 / 400,
      changedPixels: 1,
    });
  });

  it('counts an alpha-only difference as a changed pixel', () => {
    const base = makePng(20, 20, [10, 20, 30, 255]);
    const modified = clonePng(base);
    modified.data[7 * 4 + 3] = 200; // pixel 7, alpha only
    expect(comparePng(pack(base), pack(modified), EXACT)).toEqual({
      status: 'fail',
      reason: 'exceeded-threshold',
      changedFraction: 1 / 400,
      changedPixels: 1,
    });
  });
});

describe('pixel-diff boundaries', () => {
  it('passes when the single differing channel equals the tolerance exactly', () => {
    const base = makePng(20, 20, [10, 20, 30, 255]);
    const modified = clonePng(base);
    modified.data[0 * 4 + 2] = 35; // blue +5 === channelTolerance
    const result = comparePng(pack(base), pack(modified), { channelTolerance: 5, maxChangedFraction: 0 });
    expect(result).toEqual({ status: 'pass', mode: 'pixel-diff', changedFraction: 0 });
  });

  it('fails at 1/400 when one pixel exceeds the tolerance by 1 against a zero bound', () => {
    const base = makePng(20, 20, [10, 20, 30, 255]);
    const modified = clonePng(base);
    modified.data[3 * 4 + 0] = 16; // red +6 === channelTolerance + 1
    const result = comparePng(pack(base), pack(modified), { channelTolerance: 5, maxChangedFraction: 0 });
    expect(result).toEqual({
      status: 'fail',
      reason: 'exceeded-threshold',
      changedFraction: 1 / 400,
      changedPixels: 1,
    });
  });

  it('passes when 100 of 10,000 changed pixels equal maxChangedFraction 0.01', () => {
    const base = makePng(100, 100, [10, 20, 30, 255]);
    const modified = clonePng(base);
    for (let p = 0; p < 100; p += 1) {
      modified.data[p * 4 + 0] = 11;
    }
    const result = comparePng(pack(base), pack(modified), { channelTolerance: 0, maxChangedFraction: 0.01 });
    expect(result).toEqual({
      status: 'pass',
      mode: 'pixel-diff',
      changedFraction: 0.01,
      changedPixels: 100,
    });
  });

  it('fails when 101 of 10,000 changed pixels exceed maxChangedFraction 0.01', () => {
    const base = makePng(100, 100, [10, 20, 30, 255]);
    const modified = clonePng(base);
    for (let p = 0; p < 101; p += 1) {
      modified.data[p * 4 + 0] = 11;
    }
    const result = comparePng(pack(base), pack(modified), { channelTolerance: 0, maxChangedFraction: 0.01 });
    expect(result).toEqual({
      status: 'fail',
      reason: 'exceeded-threshold',
      changedFraction: 101 / 10000,
      changedPixels: 101,
    });
  });

  it('ignores sub-tolerance noise on every pixel', () => {
    const base = makePng(20, 20, [100, 100, 100, 255]);
    const modified = clonePng(base);
    for (let i = 0; i < 400; i += 1) {
      modified.data[i * 4 + 0] = 109; // +9 < channelTolerance 10
      modified.data[i * 4 + 1] = 91; // -9 < channelTolerance 10
    }
    const result = comparePng(pack(base), pack(modified), { channelTolerance: 10, maxChangedFraction: 0 });
    expect(result).toEqual({ status: 'pass', mode: 'pixel-diff', changedFraction: 0 });
  });
});

describe('dimension mismatch', () => {
  it('fails without per-pixel work when dimensions differ', () => {
    const actual = pack(makePng(1280, 720, [10, 20, 30, 255]));
    const golden = pack(makePng(1920, 1080, [10, 20, 30, 255]));
    expect(comparePng(actual, golden, EXACT)).toEqual({ status: 'fail', reason: 'dimension-mismatch' });
  });
});

describe('missing golden', () => {
  it('returns missing-golden regardless of mode or thresholds', () => {
    const actual = pack(makePng(20, 20, [10, 20, 30, 255]));
    expect(comparePng(actual, null, EXACT)).toEqual({ status: 'missing-golden' });
    expect(comparePng(actual, null, { channelTolerance: 8, maxChangedFraction: 0.02 })).toEqual({
      status: 'missing-golden',
    });
  });
});

describe('decode error', () => {
  it('reports a corrupt actual buffer instead of throwing', () => {
    const golden = pack(makePng(20, 20, [10, 20, 30, 255]));
    expect(comparePng(Buffer.from('definitely not a png', 'utf8'), golden, EXACT)).toEqual({
      status: 'fail',
      reason: 'decode-error',
    });
  });

  it('reports a corrupt/truncated golden buffer instead of throwing', () => {
    const actual = pack(makePng(20, 20, [10, 20, 30, 255]));
    const truncatedGolden = pack(makePng(20, 20, [10, 20, 30, 255])).subarray(0, 40);
    expect(comparePng(actual, truncatedGolden, EXACT)).toEqual({
      status: 'fail',
      reason: 'decode-error',
    });
  });
});

describe('determinism', () => {
  it('yields deeply equal results across repeated calls', () => {
    const base = makePng(20, 20, [10, 20, 30, 255]);
    const modified = clonePng(base);
    for (const p of [5, 50, 200]) {
      modified.data[p * 4 + 2] = 33; // three pixels beyond tolerance 2
    }
    const opts: CompareOptions = { channelTolerance: 2, maxChangedFraction: 0.5 };
    const actual = pack(base);
    const golden = pack(modified);
    expect(comparePng(actual, golden, opts)).toEqual(comparePng(actual, golden, opts));
    expect(comparePng(actual, golden, EXACT)).toEqual(comparePng(actual, golden, EXACT));
  });
});

describe('writeDiffPng', () => {
  it('writes changed pixels red and unchanged pixels transparent black', () => {
    const base = makePng(4, 4, [0, 0, 0, 255]);
    const modified = clonePng(base);
    modified.data[0] = 255; // pixel 0 changed
    const outPath = 'test-results/golden-compare-unit-diff.png';
    mkdirSync('test-results', { recursive: true });
    try {
      writeDiffPng(pack(base), pack(modified), outPath);
      const diff = PNG.sync.read(readFileSync(outPath));
      expect(diff.width).toBe(4);
      expect(diff.height).toBe(4);
      expect(Array.from(diff.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(diff.data.subarray(4, 8))).toEqual([0, 0, 0, 0]);
    } finally {
      rmSync(outPath, { force: true });
    }
  });
});
