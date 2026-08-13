import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from '../../src/player/Player';
import { SurvivalSystem } from '../../src/player/SurvivalSystem';

function player(): Player {
  return new Player({ position: new THREE.Vector3(0.5, 2, 0.5) });
}

function runFor(
  survival: SurvivalSystem,
  seconds: number,
  options: { sprinting: boolean; headSubmerged: boolean; inLava: boolean; landingDistance: number },
): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) {
    survival.update(0.1, player(), options);
  }
}

describe('survival system', () => {
  it('drains hunger faster while sprinting', () => {
    const normal = new SurvivalSystem();
    const sprinting = new SurvivalSystem();
    normal.saturation = 0;
    sprinting.saturation = 0;
    runFor(normal, 30, { sprinting: false, headSubmerged: false, inLava: false, landingDistance: 0 });
    runFor(sprinting, 30, { sprinting: true, headSubmerged: false, inLava: false, landingDistance: 0 });
    expect(sprinting.hunger).toBeLessThan(normal.hunger);
  });

  it('applies fall damage over the safe landing threshold', () => {
    const survival = new SurvivalSystem();
    survival.update(0.016, player(), { sprinting: false, headSubmerged: false, inLava: false, landingDistance: 6 });
    expect(survival.health).toBeLessThan(20);
  });

  it('drowns over time while the head remains submerged', () => {
    const survival = new SurvivalSystem();
    runFor(survival, 1.5, { sprinting: false, headSubmerged: true, inLava: false, landingDistance: 0 });
    expect(survival.health).toBe(18);
  });

  it('regenerates using hunger and saturation', () => {
    const survival = new SurvivalSystem();
    survival.health = 15;
    survival.hunger = 20;
    survival.saturation = 2;
    runFor(survival, 4, { sprinting: false, headSubmerged: false, inLava: false, landingDistance: 0 });
    expect(survival.health).toBe(16);
    expect(survival.saturation).toBe(1);
  });

  it('restores a validated snapshot and rejects malformed state', () => {
    const survival = new SurvivalSystem();
    expect(survival.restore({ version: 1, health: 7, hunger: 9, saturation: 2 })).toBe(true);
    expect(survival.snapshot()).toEqual({ version: 1, health: 7, hunger: 9, saturation: 2 });
    expect(survival.restore({ version: 2, health: 20, hunger: 20, saturation: 5 })).toBe(false);
  });

  it('damages the player at a slower interval while in lava', () => {
    const survival = new SurvivalSystem();
    runFor(survival, 0.7, { sprinting: false, headSubmerged: false, inLava: true, landingDistance: 0 });
    expect(survival.health).toBe(16);
  });
});
