import { describe, it, expect } from 'vitest';
import {
  AnimatedTextureRegistry,
  validateAnimatedTextureMetadata,
  type AnimatedTextureMetadata,
} from '../../src/data/AnimatedTexture';
import { animatedTextureFrameAt } from '../../src/rendering/AnimatedTextureFrame';

describe('validateAnimatedTextureMetadata', () => {
  it('accepts valid metadata and returns the same value', () => {
    const metadata = { frametimeTicks: 5, frames: [0, 1, 2] };
    expect(validateAnimatedTextureMetadata(metadata)).toEqual(metadata);
    expect(validateAnimatedTextureMetadata(metadata)).not.toBe(metadata); // defensive copy of frames
  });

  it('rejects invalid frametimeTicks', () => {
    for (const bad of [0, -1, 2.5, NaN, '5', null, undefined]) {
      expect(() => validateAnimatedTextureMetadata({ frametimeTicks: bad, frames: [0] } as never)).toThrow(
        /frametimeTicks/i,
      );
    }
  });

  it('rejects invalid frames', () => {
    expect(() => validateAnimatedTextureMetadata({ frametimeTicks: 5, frames: [] })).toThrow(/frames/i);
    expect(() => validateAnimatedTextureMetadata({ frametimeTicks: 5, frames: 'x' } as never)).toThrow(/frames/i);
    expect(() => validateAnimatedTextureMetadata({ frametimeTicks: 5, frames: [-1] })).toThrow(/frames\[0\]/i);
    expect(() => validateAnimatedTextureMetadata({ frametimeTicks: 5, frames: [0.5] })).toThrow(/frames\[0\]/i);
    expect(() => validateAnimatedTextureMetadata({ frametimeTicks: 5, frames: [1, '2'] } as never)).toThrow(
      /frames\[1\]/i,
    );
  });

  it('rejects non-object input', () => {
    expect(() => validateAnimatedTextureMetadata(null)).toThrow(/object/i);
    expect(() => validateAnimatedTextureMetadata(42)).toThrow(/object/i);
  });
});

describe('AnimatedTextureRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new AnimatedTextureRegistry();
    const metadata: AnimatedTextureMetadata = { frametimeTicks: 4, frames: [0, 1, 2, 3] };

    registry.register('minecraft:water', metadata);
    expect(registry.get('minecraft:water')).toEqual(metadata);
    expect(registry.has('minecraft:water')).toBe(true);
    expect(registry.has('minecraft:missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('minecraft:water')).toBeNull();
  });

  it('rejects duplicates and invalid metadata without mutation', () => {
    const registry = new AnimatedTextureRegistry();
    registry.register('minecraft:water', { frametimeTicks: 4, frames: [0] });
    expect(() => registry.register('minecraft:water', { frametimeTicks: 4, frames: [0] })).toThrow(/duplicate/i);
    expect(() =>
      registry.register('minecraft:lava', { frametimeTicks: 0, frames: [0] } as never),
    ).toThrow(/frametimeTicks/i);
    expect(registry.size).toBe(1);
    expect(registry.has('minecraft:lava')).toBe(false);
  });
});

describe('animatedTextureFrameAt', () => {
  const metadata: AnimatedTextureMetadata = { frametimeTicks: 5, frames: [0, 1, 2] };

  it('selects the frame per frametime windows', () => {
    expect(animatedTextureFrameAt(metadata, 0)).toBe(0);
    expect(animatedTextureFrameAt(metadata, 4)).toBe(0);
    expect(animatedTextureFrameAt(metadata, 5)).toBe(1);
    expect(animatedTextureFrameAt(metadata, 9)).toBe(1);
    expect(animatedTextureFrameAt(metadata, 10)).toBe(2);
    expect(animatedTextureFrameAt(metadata, 14)).toBe(2);
  });

  it('wraps around after a full cycle', () => {
    expect(animatedTextureFrameAt(metadata, 15)).toBe(0);
    expect(animatedTextureFrameAt(metadata, 16)).toBe(0);
    expect(animatedTextureFrameAt(metadata, 20)).toBe(1);
    expect(animatedTextureFrameAt(metadata, 44)).toBe(2); // 2 cycles + 14
  });

  it('clamps negative ticks to the first frame', () => {
    expect(animatedTextureFrameAt(metadata, -1)).toBe(0);
    expect(animatedTextureFrameAt(metadata, -100)).toBe(0);
  });

  it('keeps a single-frame entry constant', () => {
    const single: AnimatedTextureMetadata = { frametimeTicks: 4, frames: [3] };
    expect(animatedTextureFrameAt(single, 0)).toBe(3);
    expect(animatedTextureFrameAt(single, 99)).toBe(3);
    expect(animatedTextureFrameAt(single, -7)).toBe(3);
  });

  it('honors explicit frame orders (non-sequential)', () => {
    const order: AnimatedTextureMetadata = { frametimeTicks: 2, frames: [5, 9, 2] };
    expect(animatedTextureFrameAt(order, 0)).toBe(5);
    expect(animatedTextureFrameAt(order, 2)).toBe(9);
    expect(animatedTextureFrameAt(order, 4)).toBe(2);
    expect(animatedTextureFrameAt(order, 6)).toBe(5);
  });

  it('is pure and deterministic', () => {
    expect(animatedTextureFrameAt(metadata, 7)).toBe(animatedTextureFrameAt(metadata, 7));
    expect(animatedTextureFrameAt(metadata, 13)).toBe(2);
  });
});
