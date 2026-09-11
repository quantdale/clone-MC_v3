import { describe, expect, it } from 'vitest';
import {
  CREATIVE_FLY_SPEED,
  resolveCreativeFlightVelocity,
} from '../../src/player/CreativeFlight';

describe('CreativeFlight', () => {
  it('pins the documented fly speed', () => {
    expect(CREATIVE_FLY_SPEED).toBe(8.0);
  });

  it('survival and adventure never fly and leave velocity untouched', () => {
    for (const mode of ['survival', 'adventure'] as const) {
      for (const input of [
        { jump: false, sneak: false },
        { jump: true, sneak: false },
        { jump: false, sneak: true },
        { jump: true, sneak: true },
      ]) {
        const resolved = resolveCreativeFlightVelocity(mode, input);
        expect(resolved.flying).toBe(false);
        expect(resolved.verticalVelocity).toBe(0);
      }
    }
  });

  it('creative and spectator hover with no vertical input', () => {
    for (const mode of ['creative', 'spectator'] as const) {
      const resolved = resolveCreativeFlightVelocity(mode, { jump: false, sneak: false });
      expect(resolved).toEqual({ flying: true, verticalVelocity: 0 });
    }
  });

  it('jump ascends at fly speed in fly modes', () => {
    for (const mode of ['creative', 'spectator'] as const) {
      const resolved = resolveCreativeFlightVelocity(mode, { jump: true, sneak: false });
      expect(resolved).toEqual({ flying: true, verticalVelocity: CREATIVE_FLY_SPEED });
    }
  });

  it('sneak descends at fly speed in fly modes', () => {
    for (const mode of ['creative', 'spectator'] as const) {
      const resolved = resolveCreativeFlightVelocity(mode, { jump: false, sneak: true });
      expect(resolved).toEqual({ flying: true, verticalVelocity: -CREATIVE_FLY_SPEED });
    }
  });

  it('opposing inputs cancel to hover', () => {
    for (const mode of ['creative', 'spectator'] as const) {
      const resolved = resolveCreativeFlightVelocity(mode, { jump: true, sneak: true });
      expect(resolved).toEqual({ flying: true, verticalVelocity: 0 });
    }
  });

  it('honors an injected speed override', () => {
    const resolved = resolveCreativeFlightVelocity('creative', { jump: true, sneak: false }, 4.5);
    expect(resolved).toEqual({ flying: true, verticalVelocity: 4.5 });
  });

  it('is deterministic across repeated calls', () => {
    const first = resolveCreativeFlightVelocity('creative', { jump: true, sneak: false });
    const second = resolveCreativeFlightVelocity('creative', { jump: true, sneak: false });
    expect(second).toEqual(first);
  });
});
