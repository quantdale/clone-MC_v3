import { describe, it, expect } from 'vitest';
import { validatePlayerStateRecord } from '../../src/storage/PlayerStateRecord';

function validRecord(): Record<string, unknown> {
  return {
    key: 'world-1',
    worldId: 'world-1',
    seed: 12345,
    position: [1.5, 63.5, 2.5],
    yaw: 90,
    pitch: 0,
    inventory: { slots: [] },
    survival: { version: 1, health: 20, food: 20 },
    experience: { version: 1, level: 0, xp: 0 },
  };
}

describe('validatePlayerStateRecord experience field', () => {
  it('accepts a record that carries an experience payload', () => {
    const rec = validRecord();
    expect(() => validatePlayerStateRecord(rec)).not.toThrow();
    const parsed = validatePlayerStateRecord(rec);
    expect(parsed.experience).toEqual({ version: 1, level: 0, xp: 0 });
  });

  it('rejects a record missing experience', () => {
    const rec = validRecord();
    delete rec.experience;
    expect(() => validatePlayerStateRecord(rec)).toThrow(/experience must be present/);
  });

  it('still rejects a record missing survival (regression guard)', () => {
    const rec = validRecord();
    delete rec.survival;
    expect(() => validatePlayerStateRecord(rec)).toThrow(/survival must be present/);
  });
});

describe('validatePlayerStateRecord effects field (292)', () => {
  it('passes an effects payload through untouched', () => {
    const rec = validRecord();
    const effects = {
      version: 1,
      effects: [{ typeId: 'minecraft:effect/hero_of_the_village', duration: 12.5, amplifier: 1 }],
      badOmen: { level: 2, remainingSeconds: 300 },
    };
    rec.effects = effects;
    const parsed = validatePlayerStateRecord(rec);
    expect(parsed.effects).toBe(effects);
  });

  it('keeps pre-292 records without an effects key (backward compatible)', () => {
    const parsed = validatePlayerStateRecord(validRecord());
    expect('effects' in parsed).toBe(false);
    expect(parsed).toStrictEqual({
      key: 'world-1',
      worldId: 'world-1',
      seed: 12345,
      position: [1.5, 63.5, 2.5],
      yaw: 90,
      pitch: 0,
      inventory: { slots: [] },
      survival: { version: 1, health: 20, food: 20 },
      experience: { version: 1, level: 0, xp: 0 },
    });
  });

  it('does not validate the opaque payload (the game parses it tolerantly)', () => {
    const rec = validRecord();
    rec.effects = 'garbage';
    expect(() => validatePlayerStateRecord(rec)).not.toThrow();
    expect(validatePlayerStateRecord(rec).effects).toBe('garbage');
  });
});
