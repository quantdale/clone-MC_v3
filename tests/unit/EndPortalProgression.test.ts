import { describe, it, expect } from 'vitest';
import {
  END_OBSIDIAN_PLATFORM_HALF_SIZE,
  END_OBSIDIAN_PLATFORM_Y,
  END_PORTAL_FRAME_COUNT,
  PORTAL_TELEPORT_COOLDOWN_TICKS,
  endObsidianPlatformPositions,
  endPortalDestination,
  endPortalEyeCells,
  endPortalFrameCells,
  endPortalInteriorCells,
  endPortalIsActivated,
  endReturnGatewayAllowed,
  endSpawnPosition,
  endTeleportIsReady,
} from '../../src/simulation/EndPortalProgression';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

describe('end obsidian platform', () => {
  it('is exactly 25 cells at y=49 covering x/z in [-2..2]', () => {
    const cells = endObsidianPlatformPositions();
    expect(cells.length).toBe(25);
    expect(END_OBSIDIAN_PLATFORM_HALF_SIZE).toBe(2);
    expect(END_OBSIDIAN_PLATFORM_Y).toBe(49);
    const seen = new Set(cells.map(([x, y, z]) => key(x, y, z)));
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        expect(seen.has(key(dx, 49, dz))).toBe(true);
      }
    }
    expect(seen.size).toBe(25);
  });

  it('spawns the player standing on the platform center', () => {
    expect(endSpawnPosition()).toEqual([0.5, 50, 0.5]);
  });
});

describe('end portal frame geometry', () => {
  it('is a 5x5 ring of 16 cells around a 3x3 interior of 9 cells, with no overlap', () => {
    const frame = endPortalFrameCells(0, 64, 0);
    const interior = endPortalInteriorCells(0, 64, 0);
    expect(frame.length).toBe(16);
    expect(interior.length).toBe(9);
    const frameSet = new Set(frame.map(([x, y, z]) => key(x, y, z)));
    const interiorSet = new Set(interior.map(([x, y, z]) => key(x, y, z)));
    for (const cell of frameSet) expect(interiorSet.has(cell)).toBe(false);
    // The union is the full 5x5.
    expect(frameSet.size + interiorSet.size).toBe(25);
    // Corners are frame cells, not interior.
    expect(frameSet.has(key(-2, 64, -2))).toBe(true);
    expect(frameSet.has(key(2, 64, 2))).toBe(true);
  });

  it('has exactly 12 eye slots (edge middles, corners excluded)', () => {
    const eyes = endPortalEyeCells(0, 64, 0);
    expect(eyes.length).toBe(12);
    expect(END_PORTAL_FRAME_COUNT).toBe(12);
    const eyeSet = new Set(eyes.map(([x, y, z]) => key(x, y, z)));
    expect(eyeSet.has(key(-1, 64, -2))).toBe(true); // top edge middle
    expect(eyeSet.has(key(0, 64, -2))).toBe(true);
    expect(eyeSet.has(key(1, 64, -2))).toBe(true);
    expect(eyeSet.has(key(-2, 64, -2))).toBe(false); // corner takes no eye
    expect(eyeSet.size).toBe(12);
  });
});

describe('end portal activation', () => {
  it('requires all 12 eyes', () => {
    expect(endPortalIsActivated(0)).toBe(false);
    expect(endPortalIsActivated(11)).toBe(false);
    expect(endPortalIsActivated(12)).toBe(true);
    expect(endPortalIsActivated(13)).toBe(true);
  });
});

describe('end teleport flow', () => {
  it('every entry teleports to the platform spawn', () => {
    expect(endPortalDestination()).toEqual([0.5, 50, 0.5]);
  });

  it('re-entry is gated by the 178 cooldown', () => {
    expect(PORTAL_TELEPORT_COOLDOWN_TICKS).toBe(300);
    expect(endTeleportIsReady(1000, 1200)).toBe(false); // 100 remaining
    expect(endTeleportIsReady(1000, 1300)).toBe(true); // expired
  });

  it('the return gateway exists only when the dragon is defeated', () => {
    expect(endReturnGatewayAllowed(false)).toBe(false);
    expect(endReturnGatewayAllowed(true)).toBe(true);
  });
});
