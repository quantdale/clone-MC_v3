import { describe, it, expect } from 'vitest';
import {
  RedstoneAutomationHarness,
  REDSTONE_CONSTANTS,
} from '../support/RedstoneAutomationHarness';

const { CLOCK_PERIOD_TICKS: P } = REDSTONE_CONSTANTS;

/** Chunk coordinates of a world position (the harness's own chunking rule). */
function chunkOf(x: number, z: number): [number, number] {
  return [Math.floor(x / 16), Math.floor(z / 16)];
}

/** Record the ticks at which a read value transitions from falsy to truthy over `ticks` steps. */
function risingEdges(
  h: RedstoneAutomationHarness,
  read: () => boolean,
  fromTick: number,
  ticks: number,
): number[] {
  const edges: number[] = [];
  let prev = read();
  for (let i = 1; i <= ticks; i++) {
    h.step(1);
    const cur = read();
    if (cur && !prev) edges.push(fromTick + i);
    prev = cur;
  }
  return edges;
}

function clockOutput(h: RedstoneAutomationHarness): () => boolean {
  const o = h.buildCircuit('clock').positions.output as [number, number, number];
  return () => h.wirePowerAt(o[0], o[1], o[2]) > 0;
}

describe('redstone-automation: clock-and-divider circuit (3.1)', () => {
  it('clock produces periodic rising edges at 0/16/32/48 with no mid-period edge and no burnout', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'clk' });
    const read = clockOutput(h);
    // The output is settled high at build: the first rising edge is tick 0.
    expect(read()).toBe(true);
    const edges = risingEdges(h, read, 0, 4 * P);
    expect(edges).toEqual([P, 2 * P, 3 * P, 4 * P]);
    expect(edges).not.toContain(8);
    expect(h.isTorchBurnedOut(1)).toBe(false);
  });

  it('clock not-due and due ticks: no edge at 15, exactly one edge at 16', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'clk2' });
    const read = clockOutput(h);
    h.step(15);
    expect(read()).toBe(false); // fell at 8, not yet due
    h.step(1);
    expect(read()).toBe(true); // due exactly at 16
  });

  it('mid-cycle saveReload preserves the next absolute edge and the phase', async () => {
    const runWithReload = async (): Promise<{ edges: number[]; hash: number }> => {
      const h = new RedstoneAutomationHarness({ worldId: 'clk3' });
      const read = clockOutput(h);
      h.step(8); // mid-cycle: the torch is off, the repeater is pending
      await h.saveReload();
      const edges = risingEdges(h, read, 8, 2 * P);
      return { edges, hash: Number.parseInt(h.stateHash(), 16) };
    };
    const reloaded = await runWithReload();
    // Next edge still at the absolute tick 16, then 32.
    expect(reloaded.edges).toEqual([16, 32]);

    // A run without the round-trip reaches the identical state.
    const plain = new RedstoneAutomationHarness({ worldId: 'clk3' });
    clockOutput(plain);
    plain.step(8 + 2 * P);
    expect(Number.parseInt(plain.stateHash(), 16)).toBe(reloaded.hash);
  });

  it('mid-cycle cycleChunk preserves the next absolute edge and the stored state', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'clk4' });
    const probe = h.buildCircuit('clock');
    const read = clockOutput(h);
    h.step(8);
    const [cx, cz] = chunkOf((probe.positions.torch as [number, number, number])[0], 0);
    h.cycleChunk(cx, cz);
    const edges = risingEdges(h, read, 8, 2 * P);
    expect(edges).toEqual([16, 32]);
    // Stored wire powers and torch flag match a run without the cycle.
    const plain = new RedstoneAutomationHarness({ worldId: 'clk4' });
    clockOutput(plain);
    plain.step(8 + 2 * P);
    expect(plain.stateHash()).toBe(h.stateHash());
  });

  it('divide-by-2 emits output rising edges at 32 and 64, none at 16', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'dv2' });
    const o = h.buildDivider(2).positions.dividerOut as [number, number, number];
    const edges = risingEdges(h, () => h.isTorchLit(o[0], o[1], o[2]), 0, 4 * P);
    expect(edges).toEqual([2 * P, 4 * P]);
  });

  it('divide-by-4 emits output rising edges at 64 and 128, none at 32 or 48', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'dv4' });
    const o = h.buildDivider(4).positions.dividerOut as [number, number, number];
    const edges = risingEdges(h, () => h.isTorchLit(o[0], o[1], o[2]), 0, 8 * P);
    expect(edges).toEqual([4 * P, 8 * P]);
  });

  it('divider phase survives saveReload: the next output edge fires at its absolute tick', async () => {
    const h = new RedstoneAutomationHarness({ worldId: 'dv5' });
    const o = h.buildDivider(2).positions.dividerOut as [number, number, number];
    const lit = () => h.isTorchLit(o[0], o[1], o[2]);
    h.step(24); // mid-cycle: fell at 16, next output edge rises at 32
    expect(lit()).toBe(false); // off-half preserved across the round-trip
    await h.saveReload();
    expect(lit()).toBe(false);
    h.step(7);
    expect(lit()).toBe(false); // not due at 31
    h.step(1);
    expect(lit()).toBe(true); // rising exactly at 32
  });

  it('divider phase survives a chunk cycle: the next output edge fires at its absolute tick', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'dv6' });
    const probe = h.buildDivider(2);
    const o = probe.positions.dividerOut as [number, number, number];
    const lit = () => h.isTorchLit(o[0], o[1], o[2]);
    h.step(24);
    const t = probe.positions.output as [number, number, number];
    const [cx, cz] = chunkOf(t[0], t[2]);
    h.cycleChunk(cx, cz);
    expect(lit()).toBe(false); // off-half preserved across the cycle
    h.step(7);
    expect(lit()).toBe(false); // not due at 31
    h.step(1);
    expect(lit()).toBe(true); // rising exactly at 32
  });
});

describe('redstone-automation: t-flip-flop circuit (3.2)', () => {
  function build() {
    const h = new RedstoneAutomationHarness({ worldId: 'tff' });
    const p = h.buildCircuit('t-flip-flop');
    const out = p.positions.outA as [number, number, number];
    return {
      h,
      out,
      lit: () => h.isTorchLit(out[0], out[1], out[2]),
      edge: () => {
        h.setInput(true);
        h.step(1);
        h.setInput(false);
        h.step(1);
      },
    };
  }

  it('alternating toggles: on/off/on/off over four edges', () => {
    const f = build();
    const states: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      f.edge();
      states.push(f.lit());
    }
    expect(states).toEqual([true, false, true, false]);
  });

  it('output is stable with no input over 8 clock periods (no self-oscillation)', () => {
    const f = build();
    f.edge(); // latched on
    expect(f.lit()).toBe(true);
    for (let i = 0; i < 8 * P; i++) {
      f.h.step(1);
      expect(f.lit()).toBe(true);
    }
  });

  it('latched-on output survives saveReload; the next edge toggles off once', async () => {
    const f = build();
    f.edge();
    f.h.step(3);
    await f.h.saveReload();
    expect(f.lit()).toBe(true); // still on immediately after the round-trip
    f.edge();
    expect(f.lit()).toBe(false); // one toggle, not a reset
  });

  it('latched-off output survives saveReload; the next edge toggles on once', async () => {
    const f = build();
    f.h.step(3); // no edges yet: latched off
    await f.h.saveReload();
    expect(f.lit()).toBe(false);
    f.edge();
    expect(f.lit()).toBe(true);
  });

  it('chunk cycle preserves the latch, its block states, and the next toggle', () => {
    const f = build();
    f.edge();
    const before = f.h.probe({
      kind: 't-flip-flop',
      positions: { outA: f.out },
    });
    const [cx, cz] = chunkOf(f.out[0], f.out[2]);
    f.h.cycleChunk(cx, cz);
    expect(f.lit()).toBe(true); // on immediately after the cycle
    expect(f.h.probe({ kind: 't-flip-flop', positions: { outA: f.out } })).toEqual(before);
    f.edge();
    expect(f.lit()).toBe(false); // toggles correctly, does not reset
  });
});

describe('redstone-automation: piston-door circuit (3.3)', () => {
  function build() {
    const h = new RedstoneAutomationHarness({ worldId: 'door' });
    const p = h.buildCircuit('piston-door');
    const pos = (n: string) => p.positions[n] as [number, number, number];
    const piston = pos('piston');
    const door = pos('door');
    const movedTo = pos('movedTo');
    return {
      h,
      piston,
      door,
      movedTo,
      ext: () => h.componentAt(piston[0], piston[1], piston[2])?.extended,
      doorId: () => h.blockIdAt(door[0], door[1], door[2]),
      movedId: () => h.blockIdAt(movedTo[0], movedTo[1], movedTo[2]),
      open: () => {
        h.setInput(true);
        expect(h.stepUntil(() => h.componentAt(piston[0], piston[1], piston[2])?.extended === true, 10)).toBe(true);
      },
      close: () => {
        h.setInput(false);
        expect(h.stepUntil(() => h.componentAt(piston[0], piston[1], piston[2])?.extended === false, 10)).toBe(true);
      },
    };
  }

  it('opens farthest-first (source cleared) and closes with the block back at C', () => {
    const d = build();
    d.open();
    expect(d.ext()).toBe(true);
    expect(d.movedId()).not.toBe(0); // the door block landed at D
    expect(d.doorId()).toBe(0); // source C cleared
    d.close();
    expect(d.ext()).toBe(false);
    expect(d.doorId()).not.toBe(0); // back at C
    expect(d.movedId()).toBe(0); // D cleared again
  });

  it('open state survives saveReload (extended, block at D, C air)', async () => {
    const d = build();
    d.open();
    await d.h.saveReload();
    expect(d.ext()).toBe(true);
    expect(d.movedId()).not.toBe(0);
    expect(d.doorId()).toBe(0);
  });

  it('closed state survives saveReload (retracted, block at C)', async () => {
    const d = build();
    d.open();
    d.close();
    await d.h.saveReload();
    expect(d.ext()).toBe(false);
    expect(d.doorId()).not.toBe(0);
    expect(d.movedId()).toBe(0);
  });

  it('open state survives a chunk cycle with the block-position map unchanged', () => {
    const d = build();
    d.open();
    const [cx, cz] = chunkOf(d.piston[0], d.piston[2]);
    d.h.cycleChunk(cx, cz);
    expect(d.ext()).toBe(true);
    expect(d.movedId()).not.toBe(0);
    expect(d.doorId()).toBe(0);
  });
});

describe('redstone-automation: item-sorter-chain circuit (3.4)', () => {
  const STONE = 'minecraft:stone';

  function build(hopperCount: number, dropperCount: number) {
    const h = new RedstoneAutomationHarness({ worldId: 'sort' });
    const p = h.buildCircuit('item-sorter-chain');
    const hopper = p.positions.hopper as [number, number, number];
    const dropper = p.positions.dropper as [number, number, number];
    // Transfers REPLACE the inventory arrays, so always read through the harness.
    if (hopperCount > 0) {
      h.inventoryAt(hopper[0], hopper[1], hopper[2])![0] = {
        item: STONE,
        count: hopperCount,
        maxStack: 64,
      };
    }
    if (dropperCount > 0) {
      h.inventoryAt(dropper[0], dropper[1], dropper[2])![0] = {
        item: STONE,
        count: dropperCount,
        maxStack: 64,
      };
    }
    const hopCount = () =>
      h.stageCount(h.inventoryAt(hopper[0], hopper[1], hopper[2])!);
    const dropCount = () =>
      h.stageCount(h.inventoryAt(dropper[0], dropper[1], dropper[2])!);
    const total = () => hopCount() + dropCount() + h.ejected.reduce((s, d) => s + d.count, 0);
    return { h, hopper, dropper, hopCount, dropCount, total };
  }

  it('one-item cadence: transfer not due at 7, moves one at 8; ejection drops one at 16', () => {
    const s = build(5, 4);
    s.h.step(7);
    expect(s.hopCount()).toBe(5); // not due at 7
    expect(s.h.queue.has(s.hopper[0], s.hopper[1], s.hopper[2])).toBe(true);
    s.h.step(1);
    expect(s.hopCount()).toBe(4); // exactly one moved at 8
    expect(s.dropCount()).toBe(5);
    s.h.step(7);
    expect(s.h.ejected).toHaveLength(0); // ejection not due at 15
    s.h.step(1);
    expect(s.h.ejected).toHaveLength(1); // exactly one drop at 16
    expect(s.h.ejected[0]).toMatchObject({ item: STONE, count: 1 });
    expect(s.total()).toBe(9);
  });

  it('full destination does not spill: the source is left untouched', () => {
    const s = build(5, 0);
    const dropInv = s.h.inventoryAt(s.dropper[0], s.dropper[1], s.dropper[2])!;
    for (let i = 0; i < dropInv.length; i++) {
      dropInv[i] = { item: STONE, count: 64, maxStack: 64 };
    }
    s.h.step(8);
    expect(s.hopCount()).toBe(5); // no partial depletion
    expect(s.total()).toBe(5 + 9 * 64);
  });

  it('counts and a pending transfer survive saveReload; it fires once at its absolute tick', async () => {
    const s = build(5, 1);
    s.h.queue.cancel(s.dropper[0], s.dropper[1], s.dropper[2]); // single-stage cadence
    s.h.step(8);
    expect(s.hopCount()).toBe(4);
    expect(s.dropCount()).toBe(2);
    await s.h.saveReload();
    expect(s.hopCount()).toBe(4); // counts preserved across the round-trip
    expect(s.dropCount()).toBe(2);
    s.h.step(8);
    expect(s.hopCount()).toBe(3); // exactly one move at 16
    expect(s.dropCount()).toBe(3);
  });

  it('counts and a pending transfer survive a chunk cycle; it fires once at its absolute tick', () => {
    const s = build(5, 1);
    s.h.queue.cancel(s.dropper[0], s.dropper[1], s.dropper[2]);
    s.h.step(8);
    const [cx, cz] = chunkOf(s.hopper[0], s.hopper[2]);
    s.h.cycleChunk(cx, cz);
    expect(s.hopCount()).toBe(4);
    expect(s.dropCount()).toBe(2);
    s.h.step(8);
    expect(s.hopCount()).toBe(3);
    expect(s.dropCount()).toBe(3);
  });

  it('multi-item run conserves the item multiset across a saveReload and a chunk cycle', async () => {
    const s = build(5, 4);
    for (let t = 1; t <= 40; t++) {
      s.h.step(1);
      if (t === 12) await s.h.saveReload();
      if (t === 28) {
        const [cx, cz] = chunkOf(s.hopper[0], s.hopper[2]);
        s.h.cycleChunk(cx, cz);
      }
      expect(s.total()).toBe(9);
      expect(s.hopCount()).toBeGreaterThanOrEqual(0);
      expect(s.dropCount()).toBeGreaterThanOrEqual(0);
    }
  });
});
