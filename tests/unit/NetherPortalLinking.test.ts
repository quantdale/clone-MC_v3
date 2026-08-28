import { describe, it, expect } from 'vitest';
import {
  NETHER_PORTAL_SCALE,
  PORTAL_SEARCH_RADIUS_NETHER,
  PORTAL_SEARCH_RADIUS_OVERWORLD,
  PORTAL_TELEPORT_COOLDOWN_TICKS,
  findNearestPortal,
  portalCooldownRemaining,
  portalCreationSite,
  portalFrameCells,
  portalSearchRadius,
  portalSpawnIsSafe,
  portalSpawnPoint,
  scalePortalPosition,
  type PortalLinkingWorld,
} from '../../src/simulation/NetherPortalLinking';
import type { PortalShape } from '../../src/simulation/NetherPortal';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function makeWorld(opts: {
  portalBlocks?: string[];
  solid?: string[];
  air?: string[];
} = {}): PortalLinkingWorld {
  const portals = new Set(opts.portalBlocks ?? []);
  const solid = new Set(opts.solid ?? []);
  const air = new Set(opts.air ?? []);
  return {
    isPortalBlock(x, y, z) {
      return portals.has(key(x, y, z));
    },
    isAir(x, y, z) {
      return air.has(key(x, y, z));
    },
    isSolid(x, y, z) {
      return solid.has(key(x, y, z));
    },
  };
}

const X_SHAPE: PortalShape = { axis: 'x', x0: 10, y0: 5, z0: 20, width: 2, height: 3 };
const Z_SHAPE: PortalShape = { axis: 'z', x0: 10, y0: 5, z0: 20, width: 3, height: 3 };

describe('scalePortalPosition', () => {
  it('floors toward the nether and multiplies toward the overworld', () => {
    expect(NETHER_PORTAL_SCALE).toBe(8);
    expect(scalePortalPosition(100, 80, 'overworld-to-nether')).toEqual([12, 10]);
    expect(scalePortalPosition(-100, -80, 'overworld-to-nether')).toEqual([-13, -10]); // floor division
    expect(scalePortalPosition(12, 10, 'nether-to-overworld')).toEqual([96, 80]);
    expect(scalePortalPosition(-12, -10, 'nether-to-overworld')).toEqual([-96, -80]);
  });
});

describe('portalSearchRadius', () => {
  it('uses vanilla radii per direction', () => {
    expect(PORTAL_SEARCH_RADIUS_NETHER).toBe(16);
    expect(PORTAL_SEARCH_RADIUS_OVERWORLD).toBe(128);
    expect(portalSearchRadius('overworld-to-nether')).toBe(16);
    expect(portalSearchRadius('nether-to-overworld')).toBe(128);
  });
});

describe('findNearestPortal', () => {
  it('finds a portal block inside the radius deterministically', () => {
    const world = makeWorld({ portalBlocks: [key(10, 7, 20)] });
    expect(findNearestPortal(world, 10, 5, 20, 4)).toEqual([10, 7, 20]);
  });

  it('returns the first portal in scan order (y ascending, then x, then z)', () => {
    const world = makeWorld({
      portalBlocks: [key(12, 5, 20), key(10, 7, 20)],
    });
    // Both inside the radius; y=5 row is scanned before y=7.
    expect(findNearestPortal(world, 10, 5, 20, 4)).toEqual([12, 5, 20]);
  });

  it('returns null outside the radius and in an empty world', () => {
    const world = makeWorld({ portalBlocks: [key(30, 5, 20)] });
    expect(findNearestPortal(world, 10, 5, 20, 4)).toBeNull();
    expect(findNearestPortal(makeWorld(), 0, 0, 0, 16)).toBeNull();
  });
});

describe('portalSpawnPoint and safety', () => {
  it('centers along the axis at the bottom interior row', () => {
    expect(portalSpawnPoint(X_SHAPE)).toEqual([10, 5, 20]); // width 2 -> left cell of the pair
    expect(portalSpawnPoint(Z_SHAPE)).toEqual([10, 5, 21]); // width 3 -> middle cell along z
  });

  it('safe placement requires two blocks of clearance', () => {
    const safe = makeWorld({});
    expect(portalSpawnIsSafe(safe, 10, 5, 20)).toBe(true);
    const blockedBelow = makeWorld({ solid: [key(10, 5, 20)] });
    expect(portalSpawnIsSafe(blockedBelow, 10, 5, 20)).toBe(false);
    const blockedAbove = makeWorld({ solid: [key(10, 6, 20)] });
    expect(portalSpawnIsSafe(blockedAbove, 10, 5, 20)).toBe(false);
  });
});

describe('portalCooldownRemaining', () => {
  it('counts down from the vanilla cooldown and clamps at 0', () => {
    expect(PORTAL_TELEPORT_COOLDOWN_TICKS).toBe(300);
    expect(portalCooldownRemaining(1000, 1000)).toBe(300);
    expect(portalCooldownRemaining(1000, 1200)).toBe(100);
    expect(portalCooldownRemaining(1000, 1300)).toBe(0);
    expect(portalCooldownRemaining(1000, 5000)).toBe(0);
  });
});

describe('portalFrameCells', () => {
  it('lists the 14 ring cells and 6 interior cells of a 2x3 frame', () => {
    const { frame, interior } = portalFrameCells(X_SHAPE);
    expect(frame.length).toBe(14);
    expect(interior.length).toBe(6);
    expect(interior).toEqual([
      [10, 5, 20],
      [10, 6, 20],
      [10, 7, 20],
      [11, 5, 20],
      [11, 6, 20],
      [11, 7, 20],
    ]);
    // Ring includes both bars and both columns.
    expect(frame).toContainEqual([9, 4, 20]); // bottom-left corner
    expect(frame).toContainEqual([12, 8, 20]); // top-right corner
    expect(frame).toContainEqual([9, 6, 20]); // left column cell
    expect(frame).toContainEqual([12, 6, 20]); // right column cell
  });
});

describe('portalCreationSite', () => {
  it('finds a site at the target when the ground supports a minimal frame', () => {
    // Solid ground at y=0; the target (10, 5, 20) has clear air above.
    const solids: string[] = [];
    for (let x = -9; x <= 21; x++) {
      for (let z = 11; z <= 29; z++) {
        solids.push(key(x, 0, z));
      }
    }
    const airs: string[] = [];
    for (let y = 1; y <= 10; y++) {
      for (let x = 0; x <= 20; x++) {
        for (let z = 12; z <= 28; z++) {
          airs.push(key(x, y, z));
        }
      }
    }
    const world = makeWorld({ solid: solids, air: airs });
    const site = portalCreationSite(world, 10, 5, 20);
    expect(site).not.toBeNull();
    if (site === null) throw new Error('expected a creation site');
    // The site's bottom bar rests on the solid ground (y=0); the interior starts one above it.
    expect(site.y0).toBe(2);
    expect(site.width).toBe(2);
    expect(site.height).toBe(3);
    // The site's ring and interior are all inside the cleared region.
    const { frame, interior } = portalFrameCells(site);
    for (const [fx, fy, fz] of frame) {
      expect(world.isAir(fx, fy, fz)).toBe(true);
    }
    for (const [ix, iy, iz] of interior) {
      expect(world.isAir(ix, iy, iz)).toBe(true);
    }
  });

  it('returns null when no buildable site exists (fully solid world)', () => {
    const world = makeWorld({ solid: ['1,0,1'] });
    expect(portalCreationSite(world, 10, 5, 20)).toBeNull();
  });
});
