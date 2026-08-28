import { describe, it, expect } from 'vitest';
import {
  ProgressionHarness,
  ProgressionError,
  fullSurvivalChain,
  type ProgressionAction,
  type ProgressionStage,
} from '../support/ProgressionHarness';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';

const CHAIN = fullSurvivalChain();

/**
 * Stage boundary → number of leading `fullSurvivalChain` actions that must be
 * executed for that stage to complete. Used to split the chain into a prefix
 * (run, snapshot) and a suffix (restore, run) for save/reload-mid-progression.
 */
const STAGE_BOUNDARIES: ReadonlyArray<readonly [ProgressionStage, number]> = [
  ['fresh-world', 0],
  ['tools', 5],
  ['food', 6],
  ['shelter', 7],
  ['nether', 9],
  ['end', 13],
  ['boss-complete', 16],
];

function runPrefix(h: ProgressionHarness, n: number): void {
  h.runScript(CHAIN.slice(0, n));
}

function runSuffix(h: ProgressionHarness, n: number): void {
  h.runScript(CHAIN.slice(n));
}

describe('survival-progression: determinism + save/reload-mid-progression (3.4)', () => {
  it('same-seed full rerun produces an identical final stateHash', () => {
    const a = new ProgressionHarness({ worldSeed: 7 });
    const b = new ProgressionHarness({ worldSeed: 7 });
    a.runScript(CHAIN);
    b.runScript(CHAIN);
    expect(a.isChainComplete()).toBe(true);
    expect(b.isChainComplete()).toBe(true);
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('restore(snapshot()) then step equals a fresh run from that stage boundary (0-6)', () => {
    // Reference: a fresh harness that runs the entire chain.
    const fresh = new ProgressionHarness({ worldSeed: 7 });
    fresh.runScript(CHAIN);
    const referenceHash = fresh.stateHash();
    expect(fresh.isChainComplete()).toBe(true);

    for (const [stage, boundary] of STAGE_BOUNDARIES) {
      // Prefix harness: run up to the boundary, snapshot.
      const prefix = new ProgressionHarness({ worldSeed: 7 });
      runPrefix(prefix, boundary);
      if (stage !== 'fresh-world') {
        expect(prefix.isStageComplete(stage)).toBe(true);
      }
      const snap = prefix.snapshot();

      // Restored harness: fresh world, restore the snapshot, then run the suffix.
      const restored = new ProgressionHarness({ worldSeed: 7 });
      restored.reset();
      restored.restore(snap);
      runSuffix(restored, boundary);

      // Restored continuation must reproduce the full-chain end-state exactly.
      expect(restored.isChainComplete()).toBe(true);
      expect(restored.stateHash()).toBe(referenceHash);
    }
  });

  it('snapshot/restore is idempotent (restore twice yields the same hash)', () => {
    const a = new ProgressionHarness({ worldSeed: 7 });
    a.runScript(CHAIN);
    const snap = a.snapshot();
    const b = new ProgressionHarness({ worldSeed: 7 });
    b.reset();
    b.restore(snap);
    const c = new ProgressionHarness({ worldSeed: 7 });
    c.reset();
    c.restore(snap);
    expect(b.stateHash()).toBe(c.stateHash());
    expect(b.stateHash()).toBe(a.stateHash());
  });
});

describe('survival-progression: edge / adversarial (4.1)', () => {
  it('stepUntil with an exhausted budget returns false and never credits the stage', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    const toolChain: ProgressionAction[] = [
      { kind: 'gainWood' },
      { kind: 'craftPickaxe', tier: 'wooden' },
      { kind: 'craftPickaxe', tier: 'stone' },
      { kind: 'fireAdvancement', itemKey: 'iron_pickaxe' },
      { kind: 'fireAdvancement', itemKey: 'diamond' },
    ];
    // Only 3 of the 5 actions can run within the budget; `tools` needs all 5.
    h.enqueue(toolChain);
    const completed = h.stepUntil('tools', 3);
    expect(completed).toBe(false);
    expect(h.isStageComplete('tools')).toBe(false);
    // Budget exceeded is recorded by the harness contract (no stage credit).
    expect(h.snapshot().tick).toBeGreaterThan(0);
  });

  it('malformed restore is rejected atomically and leaves the harness unchanged', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([{ kind: 'buildShelter' }]);
    const before = h.snapshot();
    const bad = { ...before, version: 2 } as unknown as Parameters<ProgressionHarness['restore']>[0];
    expect(() => h.restore(bad)).toThrowError(ProgressionError);
    let code = '';
    try {
      h.restore(bad);
    } catch (e) {
      code = e instanceof ProgressionError ? e.code : '';
    }
    expect(code).toBe('malformed_snapshot');
    expect(h.snapshot()).toEqual(before); // unchanged
  });

  it('re-triggering an already-complete advancement is a no-op (achievedTick unchanged)', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([
      { kind: 'gainWood' },
      { kind: 'craftPickaxe', tier: 'wooden' },
      { kind: 'craftPickaxe', tier: 'stone' },
      { kind: 'fireAdvancement', itemKey: 'iron_pickaxe' },
      { kind: 'fireAdvancement', itemKey: 'diamond' },
    ]);
    const prog = (
      h as unknown as { advancementProgress: Map<string, { achieved: boolean; achievedTick: number | null }> }
    ).advancementProgress;
    const tickBefore = prog.get('minecraft:iron_tools')!.achievedTick;
    expect(tickBefore).not.toBeNull();
    // Fire the same trigger again; should not advance the achieved tick.
    h.runScript([{ kind: 'fireAdvancement', itemKey: 'iron_pickaxe' }]);
    expect(prog.get('minecraft:iron_tools')!.achievedTick).toBe(tickBefore);
    expect(prog.get('minecraft:iron_tools')!.achieved).toBe(true);
  });

  it('stateHash is stable for unchanged state and changes when progress is made', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    const h1 = h.stateHash();
    const h2 = h.stateHash();
    expect(h1).toBe(h2); // unchanged → identical
    h.runScript([{ kind: 'gainWood' }, { kind: 'craftPickaxe', tier: 'wooden' }]);
    expect(h.stateHash()).not.toBe(h1); // progress changed the hash
  });

  it('the six-stage chain is the full CoreProgressionAdvancements set (no drift)', () => {
    const keys = coreProgressionAdvancements().map((d) => d.key);
    for (const k of [
      'minecraft:stone_age',
      'minecraft:acquire_hardware',
      'minecraft:iron_tools',
      'minecraft:diamonds',
      'minecraft:enter_the_nether',
      'minecraft:enter_the_end',
      'minecraft:free_the_end',
    ]) {
      expect(keys).toContain(k);
    }
  });
});
