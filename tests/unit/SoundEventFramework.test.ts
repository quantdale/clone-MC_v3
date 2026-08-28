import { describe, it, expect } from 'vitest';
import {
  SOUND_CATEGORIES,
  SOUND_EVENTS,
  audibleVolume,
  categoryVolume,
  createDefaultSoundMix,
  deserializeSoundMix,
  effectiveVolume,
  emitSound,
  serializeSoundMix,
  setCategoryVolume,
  soundEvent,
} from '../../src/simulation/SoundEventFramework';

describe('categories and event table', () => {
  it('defines exactly the eight categories in order', () => {
    expect(SOUND_CATEGORIES).toEqual([
      'master',
      'music',
      'weather',
      'blocks',
      'hostile',
      'neutral',
      'players',
      'ambient',
    ]);
  });

  it('defines 18 valid events and looks them up', () => {
    expect(SOUND_EVENTS).toHaveLength(18);
    for (const event of SOUND_EVENTS) {
      expect(SOUND_CATEGORIES).toContain(event.category);
      expect(event.volume).toBeGreaterThan(0);
      expect(event.pitch).toBeGreaterThan(0);
      expect(event.range).toBeGreaterThan(0);
    }
    expect(soundEvent('block_break')).toEqual({
      id: 'block_break',
      category: 'blocks',
      volume: 1.0,
      pitch: 1.0,
      range: 16,
    });
    expect(soundEvent('thunder')?.volume).toBe(10.0);
    expect(soundEvent('thunder')?.range).toBe(64);
    expect(soundEvent('explosion')?.volume).toBe(4.0);
    expect(soundEvent('explosion')?.range).toBe(24);
    expect(soundEvent('nope')).toBeUndefined();
  });
});

describe('emission', () => {
  it('emits with defaults from the event definition', () => {
    expect(emitSound('block_break', [1, 2, 3])).toEqual({
      event: 'block_break',
      category: 'blocks',
      x: 1,
      y: 2,
      z: 3,
      volume: 1,
      pitch: 1,
      range: 16,
    });
  });

  it('applies option volume and clamps pitch', () => {
    expect(emitSound('block_break', [1, 2, 3], { volume: 0.5, pitch: 3 })).toMatchObject({
      volume: 0.5,
      pitch: 2,
    });
    expect(emitSound('block_break', [1, 2, 3], { pitch: 0.1 })).toMatchObject({ pitch: 0.5 });
    expect(emitSound('block_break', [1, 2, 3], { volume: -1 })).toMatchObject({ volume: 0 });
  });

  it('returns null for unknown events', () => {
    expect(emitSound('nope', [0, 0, 0])).toBeNull();
  });
});

describe('attenuation', () => {
  const emission = emitSound('block_break', [0, 0, 0]);
  if (emission === null) throw new Error('unreachable');

  it('is full at the listener and falls off linearly', () => {
    expect(audibleVolume(emission, [0, 0, 0])).toBeCloseTo(1);
    expect(audibleVolume(emission, [8, 0, 0])).toBeCloseTo(0.5);
  });

  it('is zero at and beyond the range', () => {
    expect(audibleVolume(emission, [16, 0, 0])).toBeCloseTo(0);
    expect(audibleVolume(emission, [64, 0, 0])).toBeCloseTo(0);
  });
});

describe('mix', () => {
  it('defaults every category to full volume', () => {
    const mix = createDefaultSoundMix();
    for (const category of SOUND_CATEGORIES) {
      expect(categoryVolume(mix, category)).toBe(1);
    }
  });

  it('sets volumes with identity no-ops on invalid or same values', () => {
    const mix = createDefaultSoundMix();
    const half = setCategoryVolume(mix, 'blocks', 0.5);
    expect(half).not.toBe(mix);
    expect(categoryVolume(half, 'blocks')).toBe(0.5);
    expect(categoryVolume(half, 'master')).toBe(1);
    expect(setCategoryVolume(half, 'blocks', 0.5)).toBe(half);
    expect(setCategoryVolume(half, 'blocks', 1.5)).toBe(half);
    expect(setCategoryVolume(half, 'blocks', -0.1)).toBe(half);
    expect(setCategoryVolume(half, 'blocks', NaN)).toBe(half);
  });

  it('scales effective volume by category mix', () => {
    const mix = setCategoryVolume(createDefaultSoundMix(), 'blocks', 0.5);
    const emission = emitSound('block_break', [0, 0, 0]);
    if (emission === null) throw new Error('unreachable');
    expect(effectiveVolume(mix, emission, [8, 0, 0])).toBeCloseTo(0.25); // 0.5 audible * 0.5 mix
    expect(effectiveVolume(mix, emission, [64, 0, 0])).toBeCloseTo(0);
  });
});

describe('persistence', () => {
  it('round-trips mixes', () => {
    const mix = setCategoryVolume(createDefaultSoundMix(), 'hostile', 0.25);
    expect(deserializeSoundMix(serializeSoundMix(mix))).toEqual(mix);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeSoundMix('x')).toThrow('SoundFramework: expected an object');
    expect(() => deserializeSoundMix(null)).toThrow('SoundFramework: expected an object');
  });

  it('rejects an unsupported version', () => {
    expect(() => deserializeSoundMix({ version: 0, volumes: {} })).toThrow(
      'SoundFramework: unsupported version 0',
    );
  });

  it('rejects an unknown category', () => {
    expect(() => deserializeSoundMix({ version: 1, volumes: { nope: 1 } })).toThrow(
      'SoundFramework: unknown category nope',
    );
  });

  it('rejects volumes outside [0, 1]', () => {
    expect(() => deserializeSoundMix({ version: 1, volumes: { blocks: 1.5 } })).toThrow(
      'SoundFramework: category blocks volume must be in [0, 1], got 1.5',
    );
  });

  it('rejects unknown keys', () => {
    expect(() => deserializeSoundMix({ version: 1, volumes: { master: 1 }, extra: true })).toThrow(
      'SoundFramework: unknown key extra',
    );
  });
});
