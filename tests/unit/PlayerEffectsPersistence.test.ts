import { describe, expect, it } from 'vitest';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { createResourceId } from '../../src/data/ResourceId';
import { StatusEffectTypeRegistry, createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import {
  BAD_OMEN_DURATION_SECONDS,
  MAX_PERSISTED_EFFECTS,
  PLAYER_EFFECTS_PAYLOAD_VERSION,
  normalizeBadOmen,
  parsePlayerEffects,
  refreshBadOmenDuration,
  serializePlayerEffects,
  tickBadOmen,
} from '../../src/simulation/PlayerEffectsPersistence';

/** Oracles for the 292 player status-effect persistence codec. */

const registry = createDefaultStatusEffectRegistry();
const HOTV = 'minecraft:effect/hero_of_the_village';
const SPEED = 'minecraft:effect/speed';
const hotvId = createResourceId('minecraft', 'effect/hero_of_the_village');

function manager(): StatusEffectManager {
  return new StatusEffectManager(registry, createDefaultAttributeRegistry());
}

describe('PlayerEffectsPersistence constants', () => {
  it('uses the vanilla 100-minute Bad Omen duration and version 1', () => {
    expect(BAD_OMEN_DURATION_SECONDS).toBe(6000);
    expect(PLAYER_EFFECTS_PAYLOAD_VERSION).toBe(1);
    expect(MAX_PERSISTED_EFFECTS).toBe(64);
  });
});

describe('serializePlayerEffects', () => {
  it('serializes HOTV and omen exactly', () => {
    const payload = serializePlayerEffects(
      [{ typeId: HOTV, duration: 2300.5, amplifier: 1 }],
      { level: 3, remainingSeconds: 4000 },
    );
    expect(payload).toEqual({
      version: 1,
      effects: [{ typeId: HOTV, duration: 2300.5, amplifier: 1 }],
      badOmen: { level: 3, remainingSeconds: 4000 },
    });
  });

  it('empty state serializes to an empty payload', () => {
    expect(serializePlayerEffects([], { level: 0, remainingSeconds: 0 })).toEqual({
      version: 1,
      effects: [],
      badOmen: { level: 0, remainingSeconds: 0 },
    });
  });

  it('omits expired/non-finite entries, caps the entry count and normalizes omen', () => {
    const many = Array.from({ length: 70 }, () => ({ typeId: SPEED, duration: 5, amplifier: 0 }));
    const payload = serializePlayerEffects(
      [
        { typeId: HOTV, duration: 0, amplifier: 0 },
        { typeId: HOTV, duration: Number.NaN, amplifier: 0 },
        { typeId: HOTV, duration: 10, amplifier: -1 },
        ...many,
      ],
      { level: 2, remainingSeconds: 0 },
    );
    expect(payload.effects).toHaveLength(MAX_PERSISTED_EFFECTS);
    expect(payload.effects.every((e) => e.typeId === SPEED)).toBe(true);
    expect(payload.badOmen).toEqual({ level: 0, remainingSeconds: 0 });
  });

  it('output is JSON-safe (structured-clone/IndexedDB friendly)', () => {
    const payload = serializePlayerEffects(
      [{ typeId: HOTV, duration: 12.75, amplifier: 2 }],
      { level: 1, remainingSeconds: 99.5 },
    );
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

describe('parsePlayerEffects — round trip and resume', () => {
  it('round-trips a live manager through serialize → parse → deserialize exactly', () => {
    const a = manager();
    a.add(hotvId, 2400, 1);
    a.add(createResourceId('minecraft', 'effect/speed'), 90, 2);
    a.tick(100.25); // HOTV 2299.75, speed expired
    const payload = serializePlayerEffects(a.serialize(), { level: 4, remainingSeconds: 1234.5 });
    const stored = JSON.parse(JSON.stringify(payload));
    const parsed = parsePlayerEffects(stored, registry);
    expect(parsed.status).toBe('ok');
    expect(parsed.dropped).toBe(0);
    const b = manager();
    b.deserialize(parsed.effects);
    expect(b.serialize()).toEqual([{ typeId: HOTV, duration: 2299.75, amplifier: 1 }]);
    expect(parsed.badOmen).toEqual({ level: 4, remainingSeconds: 1234.5 });
  });

  it('resumes the stored remaining duration (never resets to full)', () => {
    const parsed = parsePlayerEffects(
      { version: 1, effects: [{ typeId: HOTV, duration: 1234.25, amplifier: 1 }], badOmen: { level: 0, remainingSeconds: 0 } },
      registry,
    );
    const m = manager();
    m.deserialize(parsed.effects);
    expect(m.get(hotvId)?.duration).toBe(1234.25);
    expect(m.get(hotvId)?.duration).not.toBe(2400);
    m.tick(34.25);
    expect(m.get(hotvId)?.duration).toBe(1200);
  });

  it('repeated save/load cycles never lengthen a duration (no farming)', () => {
    let payload: unknown = serializePlayerEffects(
      [{ typeId: HOTV, duration: 500, amplifier: 3 }],
      { level: 5, remainingSeconds: 300 },
    );
    let prevHero = 500;
    let prevOmen = 300;
    for (let i = 0; i < 10; i++) {
      const parsed = parsePlayerEffects(JSON.parse(JSON.stringify(payload)), registry);
      const m = manager();
      m.deserialize(parsed.effects);
      m.tick(7);
      const omen = tickBadOmen(parsed.badOmen, 7);
      const hero = m.get(hotvId)!;
      expect(hero.duration).toBeLessThanOrEqual(prevHero);
      expect(hero.amplifier).toBe(3);
      expect(omen.remainingSeconds).toBeLessThanOrEqual(prevOmen);
      prevHero = hero.duration;
      prevOmen = omen.remainingSeconds;
      payload = serializePlayerEffects(m.serialize(), omen);
    }
    expect(prevHero).toBe(430);
    expect(prevOmen).toBe(230);
  });
});

describe('parsePlayerEffects — caps and clamps', () => {
  it('clamps duration/amplifier to registry bounds and omen to cap/duration', () => {
    const parsed = parsePlayerEffects(
      { version: 1, effects: [{ typeId: HOTV, duration: 999999, amplifier: 9 }], badOmen: { level: 9, remainingSeconds: 999999 } },
      registry,
    );
    expect(parsed.effects).toEqual([{ typeId: HOTV, duration: 96000, amplifier: 4 }]);
    expect(parsed.badOmen).toEqual({ level: 5, remainingSeconds: 6000 });
  });

  it('floors fractional amplifiers and omen levels', () => {
    const parsed = parsePlayerEffects(
      { version: 1, effects: [{ typeId: HOTV, duration: 10, amplifier: 1.9 }], badOmen: { level: 2.7, remainingSeconds: 10 } },
      registry,
    );
    expect(parsed.effects[0]?.amplifier).toBe(1);
    expect(parsed.badOmen.level).toBe(2);
  });

  it('level 0 or remaining 0 omen restores as none', () => {
    for (const badOmen of [
      { level: 0, remainingSeconds: 100 },
      { level: 3, remainingSeconds: 0 },
      { level: 3, remainingSeconds: -5 },
      { level: -1, remainingSeconds: 100 },
      { level: Number.NaN, remainingSeconds: 100 },
      { level: 2, remainingSeconds: Number.POSITIVE_INFINITY },
    ]) {
      expect(parsePlayerEffects({ version: 1, effects: [], badOmen }, registry).badOmen).toEqual({
        level: 0,
        remainingSeconds: 0,
      });
    }
  });

  it('dedupes repeated types (first wins) and counts duplicates as dropped', () => {
    const types = registry.entries();
    const effects = Array.from({ length: 70 }, (_, i) => {
      const t = types[i % types.length]!;
      return { typeId: `${t.id.namespace}:${t.id.path}`, duration: 5 + i, amplifier: 0 };
    });
    const parsed = parsePlayerEffects({ version: 1, effects, badOmen: null }, registry);
    expect(parsed.effects).toHaveLength(registry.size);
    expect(parsed.dropped).toBe(70 - registry.size);
    expect(parsed.effects[0]?.duration).toBe(5);
  });

  it('caps parsed entries at MAX_PERSISTED_EFFECTS over a large registry', () => {
    const big = new StatusEffectTypeRegistry(
      Array.from({ length: 80 }, (_, i) => ({
        id: createResourceId('test', `effect/e${i}`),
        key: `e${i}`,
        name: `E${i}`,
        category: 'NEUTRAL' as const,
        flags: ['DURATION_BASED' as const],
        defaultDuration: 10,
        maxDuration: 100,
        maxAmplifier: 0,
      })),
    );
    const effects = Array.from({ length: 80 }, (_, i) => ({ typeId: `test:effect/e${i}`, duration: 5, amplifier: 0 }));
    const parsed = parsePlayerEffects({ version: 1, effects, badOmen: null }, big);
    expect(parsed.effects).toHaveLength(MAX_PERSISTED_EFFECTS);
    expect(parsed.dropped).toBe(80 - MAX_PERSISTED_EFFECTS);
    expect(parsed.effects[63]?.typeId).toBe('test:effect/e63');
  });
});

describe('parsePlayerEffects — backward compatibility and fail-closed', () => {
  it('absent payload (pre-292 save) → no effects, omen 0, status absent', () => {
    for (const input of [undefined, null]) {
      expect(parsePlayerEffects(input, registry)).toEqual({
        status: 'absent',
        effects: [],
        badOmen: { level: 0, remainingSeconds: 0 },
        dropped: 0,
      });
    }
  });

  it('malformed top level or unknown version → invalid, nothing restored, no throw', () => {
    const bad: unknown[] = [
      42,
      'x',
      true,
      [],
      {},
      { version: 2, effects: [{ typeId: HOTV, duration: 10, amplifier: 0 }], badOmen: { level: 1, remainingSeconds: 5 } },
      { version: '1', effects: [] },
      { version: 1, effects: 'nope', badOmen: { level: 1, remainingSeconds: 5 } },
    ];
    for (const input of bad) {
      expect(() => parsePlayerEffects(input, registry)).not.toThrow();
      const parsed = parsePlayerEffects(input, registry);
      expect(parsed.status).toBe('invalid');
      expect(parsed.effects).toEqual([]);
      expect(parsed.badOmen).toEqual({ level: 0, remainingSeconds: 0 });
    }
  });

  it('drops malformed/unregistered/expired entries individually', () => {
    const parsed = parsePlayerEffects(
      {
        version: 1,
        effects: [
          { typeId: HOTV, duration: 100, amplifier: 1 },
          { typeId: 'minecraft:effect/nope', duration: 10, amplifier: 0 },
          { typeId: SPEED, duration: Number.NaN, amplifier: 0 },
          { typeId: SPEED, duration: 0, amplifier: 0 },
          { typeId: SPEED, duration: 30, amplifier: 1 },
          null,
          'junk',
          { typeId: 'NOT A RESOURCE ID', duration: 1, amplifier: 0 },
          { typeId: HOTV, duration: 9999, amplifier: 4 }, // duplicate: first wins
        ],
        badOmen: { level: 2, remainingSeconds: 50 },
      },
      registry,
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.effects).toEqual([
      { typeId: HOTV, duration: 100, amplifier: 1 },
      { typeId: SPEED, duration: 30, amplifier: 1 },
    ]);
    expect(parsed.dropped).toBe(7);
    expect(parsed.badOmen).toEqual({ level: 2, remainingSeconds: 50 });
  });

  it('missing/malformed badOmen keeps valid effects and restores omen 0', () => {
    for (const badOmen of [undefined, null, 5, 'x', { level: 'a', remainingSeconds: 1 }]) {
      const parsed = parsePlayerEffects(
        { version: 1, effects: [{ typeId: HOTV, duration: 5, amplifier: 0 }], badOmen },
        registry,
      );
      expect(parsed.status).toBe('ok');
      expect(parsed.effects).toHaveLength(1);
      expect(parsed.badOmen).toEqual({ level: 0, remainingSeconds: 0 });
    }
  });

  it('parsed output always deserializes atomically without throwing', () => {
    const parsed = parsePlayerEffects(
      { version: 1, effects: [{ typeId: HOTV, duration: 1e12, amplifier: 1e9 }, { typeId: SPEED, duration: 1e-9, amplifier: 0 }] },
      registry,
    );
    expect(() => manager().deserialize(parsed.effects)).not.toThrow();
  });
});

describe('Bad Omen duration helpers', () => {
  it('normalizeBadOmen enforces level > 0 ⇔ remaining > 0', () => {
    expect(normalizeBadOmen(3, 10)).toEqual({ level: 3, remainingSeconds: 10 });
    expect(normalizeBadOmen(3, 0)).toEqual({ level: 0, remainingSeconds: 0 });
    expect(normalizeBadOmen(0, 10)).toEqual({ level: 0, remainingSeconds: 0 });
    expect(normalizeBadOmen(7, 7000)).toEqual({ level: 5, remainingSeconds: 6000 });
    expect(normalizeBadOmen('3', 10)).toEqual({ level: 0, remainingSeconds: 0 });
  });

  it('refreshBadOmenDuration gives the full duration for level ≥ 1, none for 0', () => {
    expect(refreshBadOmenDuration(1)).toEqual({ level: 1, remainingSeconds: 6000 });
    expect(refreshBadOmenDuration(5)).toEqual({ level: 5, remainingSeconds: 6000 });
    expect(refreshBadOmenDuration(0)).toEqual({ level: 0, remainingSeconds: 0 });
  });

  it('tickBadOmen counts down and expiry clears the level', () => {
    let s = { level: 2, remainingSeconds: 1 };
    s = tickBadOmen(s, 0.5);
    expect(s).toEqual({ level: 2, remainingSeconds: 0.5 });
    s = tickBadOmen(s, 0.5);
    expect(s).toEqual({ level: 0, remainingSeconds: 0 });
    expect(tickBadOmen({ level: 1, remainingSeconds: 10 }, 60)).toEqual({ level: 0, remainingSeconds: 0 });
  });

  it('tickBadOmen ignores non-finite/non-positive dt', () => {
    const s = { level: 3, remainingSeconds: 100 };
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tickBadOmen(s, dt)).toBe(s);
    }
  });

  it('a full 6000 s of 1/20 s ticks expires the omen exactly at the end', () => {
    let s = refreshBadOmenDuration(1);
    const dt = 1 / 20;
    let ticks = 0;
    while (s.level > 0 && ticks < 200000) {
      s = tickBadOmen(s, dt);
      ticks++;
    }
    expect(ticks).toBeGreaterThanOrEqual(119999);
    expect(ticks).toBeLessThanOrEqual(120001);
  });
});
