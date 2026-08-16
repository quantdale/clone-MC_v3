import { describe, it, expect } from 'vitest';
import { GAME_MODES, canFly } from '../../src/simulation/GameModeFramework';
import { canBreakBlock, canPlaceBlock } from '../../src/simulation/AdventureModeRules';
import {
  canInteract,
  hasCollision,
  hasGravity,
  isAttackable,
  noclip,
  spectatorCameraAvailable,
} from '../../src/simulation/SpectatorFramework';

describe('noclip', () => {
  it('is true only for spectator', () => {
    expect([...GAME_MODES].map(noclip)).toEqual([false, false, false, true]);
  });
});

describe('gravity and collision', () => {
  it('hasGravity is false only for spectator', () => {
    expect([...GAME_MODES].map(hasGravity)).toEqual([true, true, true, false]);
  });

  it('hasCollision is false only for spectator', () => {
    expect([...GAME_MODES].map(hasCollision)).toEqual([true, true, true, false]);
  });
});

describe('interaction', () => {
  it('canInteract is false only for spectator', () => {
    expect([...GAME_MODES].map(canInteract)).toEqual([true, true, true, false]);
  });
});

describe('attackable', () => {
  it('isAttackable is false only for spectator', () => {
    expect([...GAME_MODES].map(isAttackable)).toEqual([true, true, true, false]);
  });
});

describe('camera', () => {
  it('spectatorCameraAvailable is true only for spectator', () => {
    expect([...GAME_MODES].map(spectatorCameraAvailable)).toEqual([false, false, false, true]);
  });
});

describe('composed spectator profile', () => {
  it('combines 192 flight, 194 interaction denial, and the spectator predicates', () => {
    expect(canFly('spectator')).toBe(true);
    expect(noclip('spectator')).toBe(true);
    expect(hasGravity('spectator')).toBe(false);
    expect(hasCollision('spectator')).toBe(false);
    expect(canInteract('spectator')).toBe(false);
    expect(isAttackable('spectator')).toBe(false);
    expect(spectatorCameraAvailable('spectator')).toBe(true);
    expect(canBreakBlock('spectator', 'minecraft:stone', new Set(['minecraft:stone']))).toBe(false);
    expect(canPlaceBlock('spectator', 'minecraft:stone', new Set(['minecraft:stone']))).toBe(false);
  });

  it('grants no spectator privilege to other modes', () => {
    for (const mode of ['survival', 'creative', 'adventure'] as const) {
      expect(noclip(mode)).toBe(false);
      expect(spectatorCameraAvailable(mode)).toBe(false);
      expect(hasGravity(mode)).toBe(true);
      expect(hasCollision(mode)).toBe(true);
      expect(canInteract(mode)).toBe(true);
      expect(isAttackable(mode)).toBe(true);
    }
  });
});
