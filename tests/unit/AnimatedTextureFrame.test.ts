import { describe, it, expect } from 'vitest';
import {
  animatedTextureFrameAt,
  animatedTextureCycleTicks,
  animatedTextureFrameSequence,
} from '../../src/rendering/AnimatedTextureFrame';
import type { AnimatedTextureMetadata } from '../../src/data/AnimatedTexture';

const meta: AnimatedTextureMetadata = { frametimeTicks: 5, frames: [0, 1, 2] };

describe('animatedTextureFrameAt degenerate metadata', () => {
  it('throws RangeError on empty frames', () => {
    const empty = { frametimeTicks: 2, frames: [] } as unknown as AnimatedTextureMetadata;
    expect(() => animatedTextureFrameAt(empty, 0)).toThrow(RangeError);
  });

  it('clamps non-finite and negative ticks to frame 0 (first frame)', () => {
    for (const tick of [-1, -1000, NaN, Infinity]) {
      expect(animatedTextureFrameAt(meta, tick)).toBe(0);
    }
  });

  it('clamps non-positive frametimes to one tick; fractional frametimes floor', () => {
    // frametime <= 0 degrades to exactly one tick per frame.
    for (const frametime of [0, -3, NaN]) {
      const m: AnimatedTextureMetadata = { frametimeTicks: frametime, frames: [4, 7] };
      expect(animatedTextureFrameAt(m, 0)).toBe(4);
      expect(animatedTextureFrameAt(m, 1)).toBe(7); // advanced after exactly one tick
      expect(animatedTextureFrameAt(m, 2)).toBe(4);
    }
    // A fractional frametime floors (2.9 -> 2 ticks per frame).
    const frac: AnimatedTextureMetadata = { frametimeTicks: 2.9, frames: [4, 7] };
    expect(animatedTextureFrameAt(frac, 1)).toBe(4);
    expect(animatedTextureFrameAt(frac, 2)).toBe(7);
    expect(animatedTextureCycleTicks(frac)).toBe(4); // 2 frames x floored 2
  });
});

describe('animatedTextureCycleTicks + frameSequence determinism', () => {
  it('reports the full loop length as frames x effective frametime', () => {
    expect(animatedTextureCycleTicks(meta)).toBe(15);
    expect(animatedTextureCycleTicks({ frametimeTicks: 0, frames: [3, 4, 5, 6] } as AnimatedTextureMetadata)).toBe(4);
  });

  it('frameSequence matches frameAt tick-for-tick across a cycle boundary', () => {
    const dest: number[] = [];
    animatedTextureFrameSequence(meta, 12, 8, dest);
    expect(dest).toEqual([2, 2, 2, 0, 0, 0, 0, 0]); // ticks 12..19 wrap to frame 0 at 15
    for (let i = 0; i < dest.length; i++) {
      expect(dest[i]).toBe(animatedTextureFrameAt(meta, 12 + i));
    }
  });

  it('is deterministic and writes into the caller-provided array without growth', () => {
    const a: number[] = [];
    const b: number[] = [];
    const r1 = animatedTextureFrameSequence(meta, 3, 6, a);
    const r2 = animatedTextureFrameSequence(meta, 3, 6, b);
    expect(r1).toBe(a);
    expect(r2).toBe(b);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);

    // Negative start ticks clamp to frame 0 playback from tick 0.
    const neg: number[] = [];
    animatedTextureFrameSequence({ frametimeTicks: 2, frames: [5, 6] }, -10, 4, neg);
    expect(neg).toEqual([5, 5, 6, 6]);
  });

  it('validates count before writing', () => {
    const dest: number[] = [];
    expect(() => animatedTextureFrameSequence(meta, 0, -1, dest)).toThrow(RangeError);
    expect(() => animatedTextureFrameSequence(meta, 0, 1.5, dest)).toThrow(RangeError);
    expect(dest).toHaveLength(0);
    // Zero count fills nothing.
    expect(animatedTextureFrameSequence(meta, 0, 0, dest)).toBe(dest);
  });
});
