import { describe, it, expect } from 'vitest';
import {
  ProgressionHarness,
  InMemoryWorld,
} from '../support/ProgressionHarness';
import { BlockId } from '../../src/world/BlockRegistry';
import { validatePortalFrame } from '../../src/simulation/NetherPortal';

describe('nether-progression: build and light a valid portal frame', () => {
  it('a valid obsidian frame is validated and its interior becomes nether_portal', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    h.runScript([{ kind: 'buildNetherFrame' }]);
    // Interior cells of the 2x3 frame anchored at (8,70,8): (8|9, 70|71|72, 8).
    for (const [x, y, z] of [
      [8, 70, 8],
      [9, 70, 8],
      [8, 71, 8],
      [9, 71, 8],
      [8, 72, 8],
      [9, 72, 8],
    ] as const) {
      expect(h.world.getBlock(x, y, z)).toBe(BlockId.NetherPortal);
    }
    // The stage is NOT complete until the player actually enters.
    expect(h.isStageComplete('nether')).toBe(false);
  });

  it('an invalid frame (interior width 1) is not validated', () => {
    const w = new InMemoryWorld();
    // Build a degenerate "frame": a single obsidian column ring of width 1 (no valid interior).
    for (let y = 64; y <= 68; y++) {
      w.setBlock(0, y, 0, BlockId.Obsidian);
      w.setBlock(2, y, 0, BlockId.Obsidian);
    }
    for (let x = 0; x <= 2; x++) {
      w.setBlock(x, 63, 0, BlockId.Obsidian);
      w.setBlock(x, 69, 0, BlockId.Obsidian);
    }
    // width 1 interior -> validatePortalFrame returns null.
    expect(validatePortalFrame(w, 1, 65, 0)).toBeNull();
  });

  it('entering without a valid lit portal aborts atomically with invalid_portal_frame', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    expect(() => h.runScript([{ kind: 'enterNether' }])).toThrow(/invalid_portal_frame/);
    expect(h.isStageComplete('nether')).toBe(false);
    expect(h.snapshot().playerDimension).toBe('minecraft:overworld');
  });
});

describe('nether-progression: enter the Nether', () => {
  it('stepping into a lit portal teleports to the_nether with 1:8 scale and enter_the_nether', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    h.runScript([{ kind: 'buildNetherFrame' }, { kind: 'enterNether' }]);
    expect(h.snapshot().playerDimension).toBe('minecraft:the_nether');
    // Overworld anchor x/z = 8 -> floor(8/8) = 1.
    const [px, , pz] = h.snapshot().playerPosition;
    expect([px, pz]).toEqual([1, 1]);
    expect(h.isStageComplete('nether')).toBe(true);
    const adv = (h as unknown as { advancementProgress: Map<string, { achieved: boolean }> }).advancementProgress.get('minecraft:enter_the_nether')!;
    expect(adv.achieved).toBe(true);
  });
});

describe('nether-progression: return linking and cooldown', () => {
  it('returning scales back to the overworld (x8) after the 300-tick cooldown', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    h.runScript([
      { kind: 'buildNetherFrame' },
      { kind: 'enterNether' },
      { kind: 'wait', ticks: 300 },
      { kind: 'returnOverworld' },
    ]);
    expect(h.snapshot().playerDimension).toBe('minecraft:overworld');
    const [px, , pz] = h.snapshot().playerPosition;
    expect([px, pz]).toEqual([8, 8]); // nether 1 * 8
  });

  it('re-entry is blocked during the cooldown', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    expect(() =>
      h.runScript([{ kind: 'buildNetherFrame' }, { kind: 'enterNether' }, { kind: 'returnOverworld' }]),
    ).toThrow(/portal_teleport_on_cooldown/);
    // Dimension/position unchanged by the aborted return.
    expect(h.snapshot().playerDimension).toBe('minecraft:the_nether');
  });
});

describe('nether-progression: Nether state survives reload', () => {
  it('snapshot in the Nether restores identically and can return', () => {
    const h = new ProgressionHarness({ worldSeed: 3 });
    h.runScript([{ kind: 'buildNetherFrame' }, { kind: 'enterNether' }]);
    const snap = h.snapshot();
    const restored = new ProgressionHarness({ worldSeed: 3 });
    restored.reset();
    restored.restore(snap);
    expect(restored.snapshot().playerDimension).toBe('minecraft:the_nether');
    expect(restored.snapshot().playerPosition).toEqual(h.snapshot().playerPosition);
    expect(restored.isStageComplete('nether')).toBe(true);
    // Returning from the restored state lands back in the overworld at x8.
    restored.runScript([{ kind: 'wait', ticks: 300 }, { kind: 'returnOverworld' }]);
    expect(restored.snapshot().playerDimension).toBe('minecraft:overworld');
  });
});
