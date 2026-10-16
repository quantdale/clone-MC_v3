import { describe, it, expect } from 'vitest';
import {
  RedstoneAutomationHarness,
  AutomationError,
  REDSTONE_CONSTANTS,
  type CircuitProbe,
  type FixtureSaveBoundary,
} from '../support/RedstoneAutomationHarness';

const {
  CLOCK_PERIOD_TICKS: P,
  TORCH_UPDATE_DELAY_TICKS,
  BURNOUT_TOGGLE_LIMIT,
  BURNOUT_RECOVERY_TICKS,
} = REDSTONE_CONSTANTS;

const STONE = 'minecraft:stone';

type HarnessSnapshot = ReturnType<RedstoneAutomationHarness['snapshot']>;

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

/** Build the clock circuit and return a reader for its output wire. */
function clockOutput(h: RedstoneAutomationHarness): () => boolean {
  const o = h.buildCircuit('clock').positions.output as [number, number, number];
  return () => h.wirePowerAt(o[0], o[1], o[2]) > 0;
}

describe('automation-harness: deterministic construction & stepping', () => {
  it('two identically constructed harnesses driven by the same script produce identical stateHash', () => {
    const run = (): string => {
      const h = new RedstoneAutomationHarness({ worldId: 'det-clock' });
      clockOutput(h);
      h.step(40);
      return h.stateHash();
    };
    expect(run()).toBe(run());
  });

  it('a due event fires exactly once at its absolute tick (hopper transfer at tick 8)', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'due-once' });
    const p = h.buildCircuit('item-sorter-chain');
    const hopper = p.positions.hopper as [number, number, number];
    const dropper = p.positions.dropper as [number, number, number];
    h.inventoryAt(hopper[0], hopper[1], hopper[2])![0] = {
      item: STONE,
      count: 5,
      maxStack: 64,
    };
    // Transfers REPLACE the inventory arrays, so always re-read through the harness.
    const hopCount = (): number =>
      h.stageCount(h.inventoryAt(hopper[0], hopper[1], hopper[2])!);
    const dropCount = (): number =>
      h.stageCount(h.inventoryAt(dropper[0], dropper[1], dropper[2])!);

    h.step(7);
    expect(hopCount()).toBe(5); // not due before tick 8
    expect(dropCount()).toBe(0);

    h.step(1); // tick 8: exactly one hopper→dropper transfer
    expect(hopCount()).toBe(4);
    expect(dropCount()).toBe(1);
  });

  it('stepUntil budget exhaustion returns false, leaves the predicate false, and advances the tick by exactly maxSteps', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'budget' });
    h.buildCircuit('clock');
    const met = h.stepUntil(() => false, 9);
    expect(met).toBe(false);
    expect(h.currentTick()).toBe(9);
  });
});

describe('automation-harness: snapshot/restore', () => {
  it('restore(snapshot()) mid-run then continuing equals an uninterrupted run', () => {
    const a = new RedstoneAutomationHarness({ worldId: 'snap-equiv' });
    a.buildCircuit('clock');
    a.step(12);
    const snap = a.snapshot();
    a.step(12); // uninterrupted continuation to tick 24
    const hashA = a.stateHash();

    const b = new RedstoneAutomationHarness({ worldId: 'snap-equiv' });
    b.restore(snap);
    b.step(12);
    expect(b.stateHash()).toBe(hashA);
  });

  it('rejects every malformed snapshot atomically, leaving the harness state untouched', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'bad-snap' });
    h.buildCircuit('clock');
    h.step(4);
    const before = h.snapshot();
    const cases: Array<{ name: string; code: string; bad: unknown }> = [
      {
        name: 'wrong snapshot version',
        code: 'malformed_snapshot',
        bad: { ...before, version: 2 },
      },
      {
        name: 'non-integer tick',
        code: 'malformed_snapshot',
        bad: { ...before, tick: 1.5 },
      },
      {
        name: 'foreign worldId',
        code: 'malformed_snapshot',
        bad: { ...before, worldId: 'other-world' },
      },
      {
        name: 'scheduled-tick queue version !== 1',
        code: 'malformed_scheduled_queue',
        bad: { ...before, scheduledTicks: { ...before.scheduledTicks, version: 2 } },
      },
      {
        name: 'duplicate block-entity key',
        code: 'malformed_snapshot',
        bad: {
          ...before,
          comps: [
            ...before.comps,
            [...before.comps[0]!] as unknown as HarnessSnapshot['comps'][number],
          ],
        },
      },
      {
        name: 'malformed block tuple',
        code: 'malformed_snapshot',
        bad: { ...before, blocks: [...before.blocks, [-1.5, 0, 0, 1, {}]] },
      },
    ];
    for (const c of cases) {
      let code = '';
      try {
        h.restore(c.bad as HarnessSnapshot);
      } catch (e) {
        code = e instanceof AutomationError ? e.code : '';
      }
      expect(code, c.name).toBe(c.code);
      expect(h.snapshot(), c.name).toEqual(before); // atomic: nothing half-applied
    }
  });
});

describe('automation-harness: full save→reload', () => {
  it('a pending event survives saveReload and the output rises exactly once at absolute tick 16', async () => {
    const h = new RedstoneAutomationHarness({ worldId: 'save-clock' });
    const read = clockOutput(h);
    h.step(8); // mid-cycle: torch off, repeater output pending
    await h.saveReload();
    expect(read()).toBe(false);
    const edges = risingEdges(h, read, 8, 2 * P);
    expect(edges).toEqual([P, 2 * P]); // rises exactly at 16 (once), then 32
  });

  it('an encode failure leaves no partial world: stateHash unchanged after rejected saveReload', async () => {
    const store = new Map<string, unknown>();
    const boundary: FixtureSaveBoundary = {
      write: (worldId, cx, cz, kind, payload) => {
        if (kind === 'block-entities') throw new Error('boundary write failure');
        store.set(`${worldId}|${cx}|${cz}|${kind}`, payload);
      },
      read: (worldId, cx, cz, kind) => {
        const v = store.get(`${worldId}|${cx}|${cz}|${kind}`);
        if (v === undefined) throw new Error(`FixtureSaveBoundary: missing ${kind}`);
        return v;
      },
      clear: () => store.clear(),
    };
    const h = new RedstoneAutomationHarness({ worldId: 'encode-fail', boundary });
    h.buildCircuit('clock');
    h.step(8);
    const hashBefore = h.stateHash();
    await expect(h.saveReload()).rejects.toThrow();
    expect(h.stateHash()).toBe(hashBefore);
  });
});

describe('automation-harness: single-chunk cycle', () => {
  it('a pending event inside the cycled chunk survives and the output rises exactly at tick 16', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'cycle-inside' });
    const read = clockOutput(h);
    h.step(8);
    h.cycleChunk(2, 0); // the clock's own chunk
    const edges = risingEdges(h, read, 8, 2 * P);
    expect(edges).toEqual([P, 2 * P]);
  });

  it('a pending entry outside the cycled chunk is not cancelled and fires at its absolute tick', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'cycle-outside' });
    h.buildCircuit('clock');
    h.queue.schedule(500, 64, 0, 30); // foreign position in another chunk
    h.cycleChunk(2, 0);
    expect(h.queue.has(500, 64, 0)).toBe(true);
    h.step(30);
    expect(h.queue.has(500, 64, 0)).toBe(false); // fired at tick 30
  });
});

describe('automation-harness: circuit building & probing', () => {
  it('building a second circuit does not disturb the first probed circuit state', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'disjoint' });
    const clockProbe = h.buildCircuit('clock');
    const p1 = h.probe(clockProbe);
    h.buildCircuit('t-flip-flop');
    expect(h.probe(clockProbe)).toEqual(p1);
  });
});

describe('automation-harness: state hash', () => {
  it('stateHash is stable across repeated calls while unchanged and changes after step(1)', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'hash-stable' });
    h.buildCircuit('clock');
    const a = h.stateHash();
    expect(h.stateHash()).toBe(a);
    h.step(1);
    expect(h.stateHash()).not.toBe(a);
  });
});

describe('automation-harness: task 4.1 edge/adversarial', () => {
  it('scheduling a duplicate position updates the due tick in place (single entry)', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'dup-sched' });
    h.queue.schedule(200, 64, 0, 100);
    h.queue.schedule(200, 64, 0, 50);
    const entries = h.queue
      .serialize()
      .entries.filter((e) => e.x === 200 && e.y === 64 && e.z === 0);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.tickTime).toBe(50);
  });

  it('an exhausted stepUntil budget never credits completion', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'never-met' });
    const p = h.buildCircuit('t-flip-flop');
    const out = p.positions.outA as [number, number, number];
    // No input edge is ever driven, so the latched output can never turn on.
    const met = h.stepUntil(() => h.isTorchLit(out[0], out[1], out[2]), 5);
    expect(met).toBe(false);
    expect(h.isTorchLit(out[0], out[1], out[2])).toBe(false);
    expect(h.currentTick()).toBe(5);
  });
});

describe('automation-harness: task 3.6 survival matrix', () => {
  /** Per-run context carrying the built probe across the interruption point. */
  interface MatrixCtx {
    probe: CircuitProbe | null;
  }

  interface MatrixRow {
    name: string;
    chunk: [number, number];
    runUntilOp: (h: RedstoneAutomationHarness, ctx: MatrixCtx) => void;
    runAfterOp: (h: RedstoneAutomationHarness, ctx: MatrixCtx) => void;
  }

  interface MatrixOp {
    name: string;
    apply: (h: RedstoneAutomationHarness, row: MatrixRow) => void | Promise<void>;
  }

  /** One T-flip-flop input edge: raise, step, lower, step. */
  const edge = (h: RedstoneAutomationHarness): void => {
    h.setInput(true);
    h.step(1);
    h.setInput(false);
    h.step(1);
  };

  /** Drive the piston door fully open (extend) or closed (retract). */
  const driveDoor = (
    h: RedstoneAutomationHarness,
    probe: CircuitProbe,
    extend: boolean,
  ): void => {
    const piston = probe.positions.piston as [number, number, number];
    h.setInput(extend);
    expect(
      h.stepUntil(
        () => h.componentAt(piston[0], piston[1], piston[2])?.extended === extend,
        10,
      ),
    ).toBe(true);
  };

  /** Preload the sorter stages: `hopperCount` stone in the hopper, `dropperCount` in the dropper. */
  const preloadSorter = (
    h: RedstoneAutomationHarness,
    probe: CircuitProbe,
    hopperCount: number,
    dropperCount: number,
  ): void => {
    const hopper = probe.positions.hopper as [number, number, number];
    const dropper = probe.positions.dropper as [number, number, number];
    h.inventoryAt(hopper[0], hopper[1], hopper[2])![0] = {
      item: STONE,
      count: hopperCount,
      maxStack: 64,
    };
    h.inventoryAt(dropper[0], dropper[1], dropper[2])![0] = {
      item: STONE,
      count: dropperCount,
      maxStack: 64,
    };
  };

  const rows: MatrixRow[] = [
    {
      name: 'clock',
      chunk: [2, 0],
      runUntilOp: (h) => {
        h.buildCircuit('clock');
        h.step(20);
      },
      runAfterOp: (h) => {
        h.step(20);
      },
    },
    {
      name: 'pulse-divider',
      chunk: [4, 0],
      runUntilOp: (h) => {
        h.buildDivider(2);
        h.step(24);
      },
      runAfterOp: (h) => {
        h.step(48);
      },
    },
    {
      name: 't-flip-flop',
      chunk: [6, 0],
      runUntilOp: (h) => {
        h.buildCircuit('t-flip-flop');
        edge(h);
        h.step(5);
      },
      runAfterOp: (h) => {
        edge(h);
        h.step(5);
      },
    },
    {
      name: 'piston-door',
      chunk: [8, 0],
      runUntilOp: (h, ctx) => {
        ctx.probe = h.buildCircuit('piston-door');
        driveDoor(h, ctx.probe, true);
        h.step(2);
      },
      runAfterOp: (h, ctx) => {
        driveDoor(h, ctx.probe!, false);
      },
    },
    {
      name: 'item-sorter-chain',
      chunk: [10, 0],
      runUntilOp: (h, ctx) => {
        ctx.probe = h.buildCircuit('item-sorter-chain');
        preloadSorter(h, ctx.probe, 5, 4);
        h.step(12);
      },
      runAfterOp: (h) => {
        h.step(28);
      },
    },
    {
      name: 'torch-burnout',
      chunk: [0, 0],
      runUntilOp: (h) => {
        h.buildCircuit('torch-burnout');
        h.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS); // burnt out at tick 18
      },
      runAfterOp: (h) => {
        h.setTorchDriven(false);
        h.step(BURNOUT_RECOVERY_TICKS); // quiet window elapsed → recovered
      },
    },
  ];

  const ops: MatrixOp[] = [
    { name: 'none (baseline)', apply: () => undefined },
    { name: 'saveReload', apply: (h) => h.saveReload() },
    {
      name: 'cycleChunk',
      apply: (h, row) => h.cycleChunk(row.chunk[0], row.chunk[1]),
    },
  ];

  async function runRow(row: MatrixRow, op: MatrixOp): Promise<string> {
    const h = new RedstoneAutomationHarness({ worldId: `matrix-${row.name}` });
    const ctx: MatrixCtx = { probe: null };
    row.runUntilOp(h, ctx);
    await op.apply(h, row);
    row.runAfterOp(h, ctx);
    return h.stateHash();
  }

  it('every circuit interrupted mid-script reaches the identical baseline final stateHash', async () => {
    for (const row of rows) {
      let baseline: string | null = null;
      for (const op of ops) {
        const hash = await runRow(row, op);
        if (baseline === null) baseline = hash;
        expect(hash, `${row.name} / op ${op.name}`).toBe(baseline);
      }
    }
  });
});
