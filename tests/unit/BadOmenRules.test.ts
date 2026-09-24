import { describe, expect, it } from 'vitest';
import {
  BAD_OMEN_MAX_LEVEL,
  clampBadOmenLevel,
  clearBadOmen,
  createBadOmen,
  grantBadOmen,
  resolveVillageRaidTrigger,
  type BadOmenState,
  type VillageContext,
} from '../../src/simulation/BadOmenRules';

const insideVillage = (
  overrides: Partial<VillageContext> = {},
): VillageContext => ({
  centerX: 10,
  centerY: 64,
  centerZ: -3,
  containsPlayer: true,
  ...overrides,
});

describe('BadOmenRules (285)', () => {
  describe('clampBadOmenLevel', () => {
    it('maps non-finite and negatives to 0 and caps at max', () => {
      expect(clampBadOmenLevel(Number.NaN)).toBe(0);
      expect(clampBadOmenLevel(Number.POSITIVE_INFINITY)).toBe(0);
      expect(clampBadOmenLevel(Number.NEGATIVE_INFINITY)).toBe(0);
      expect(clampBadOmenLevel(-3)).toBe(0);
      expect(clampBadOmenLevel(-0.4)).toBe(0);
      expect(clampBadOmenLevel(0)).toBe(0);
      expect(clampBadOmenLevel(1.9)).toBe(1);
      expect(clampBadOmenLevel(5)).toBe(5);
      expect(clampBadOmenLevel(99)).toBe(BAD_OMEN_MAX_LEVEL);
    });
  });

  describe('grantBadOmen / clearBadOmen', () => {
    it('never throws on invalid grant inputs and keeps level in range', () => {
      let state: BadOmenState = createBadOmen();
      expect(state.level).toBe(0);
      state = grantBadOmen(state, Number.NaN);
      expect(state.level).toBe(0);
      state = grantBadOmen(state, Number.POSITIVE_INFINITY);
      expect(state.level).toBe(0);
      state = grantBadOmen(state, -3);
      expect(state.level).toBe(0);
      state = grantBadOmen(state, 1.9);
      expect(state.level).toBe(1);
    });

    it('stacks toward the cap and clear is idempotent', () => {
      let state = createBadOmen(4);
      state = grantBadOmen(state, 3);
      expect(state.level).toBe(5);
      const capped = grantBadOmen(state, 1);
      expect(capped.level).toBe(5);
      expect(capped).toBe(state); // identity no-op at cap
      const cleared = clearBadOmen(state);
      expect(cleared.level).toBe(0);
      expect(clearBadOmen(cleared).level).toBe(0);
    });

    it('defaults grant amount to 1 and rejects non-positive amounts', () => {
      const base = createBadOmen(2);
      expect(grantBadOmen(base).level).toBe(3);
      expect(grantBadOmen(base, 0)).toBe(base);
      expect(grantBadOmen(base, -1)).toBe(base);
    });
  });

  describe('resolveVillageRaidTrigger', () => {
    it('returns START_RAID for valid village + omen', () => {
      const decision = resolveVillageRaidTrigger(createBadOmen(2), insideVillage());
      expect(decision).toEqual({
        kind: 'START_RAID',
        centerX: 10,
        centerY: 64,
        centerZ: -3,
        badOmenLevel: 2,
      });
    });

    it('returns INVALID_CENTER for non-finite center and emits no start coords', () => {
      const decision = resolveVillageRaidTrigger(
        createBadOmen(3),
        insideVillage({ centerX: Number.NaN }),
      );
      expect(decision).toEqual({ kind: 'NONE', reason: 'INVALID_CENTER' });
    });

    it('applies stable reason precedence', () => {
      expect(resolveVillageRaidTrigger(createBadOmen(0), null)).toEqual({
        kind: 'NONE',
        reason: 'NO_OMEN',
      });
      expect(resolveVillageRaidTrigger(createBadOmen(1), null)).toEqual({
        kind: 'NONE',
        reason: 'NO_VILLAGE',
      });
      expect(resolveVillageRaidTrigger(createBadOmen(1), undefined)).toEqual({
        kind: 'NONE',
        reason: 'NO_VILLAGE',
      });
      expect(
        resolveVillageRaidTrigger(
          createBadOmen(1),
          insideVillage({ containsPlayer: false }),
        ),
      ).toEqual({ kind: 'NONE', reason: 'NOT_INSIDE' });
      // containsPlayer must be strictly true — undefined/other is NOT_INSIDE
      expect(
        resolveVillageRaidTrigger(
          createBadOmen(1),
          { centerX: 0, centerY: 0, centerZ: 0, containsPlayer: false },
        ),
      ).toEqual({ kind: 'NONE', reason: 'NOT_INSIDE' });
    });

    it('is total over empty state objects', () => {
      expect(resolveVillageRaidTrigger({ level: Number.NaN }, insideVillage())).toEqual({
        kind: 'NONE',
        reason: 'NO_OMEN',
      });
    });
  });
});
