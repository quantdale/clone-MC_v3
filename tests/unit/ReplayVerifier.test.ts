import { describe, it, expect } from "vitest";
import { SeedRng } from "../../src/simulation/SeedRng";
import { type HarnessSystem } from "../../src/simulation/SimulationHarness";
import { WorldTickProcess } from "../../src/simulation/WorldTickProcess";
import { hashState } from "../../src/simulation/StateHasher";
import {
  compareHashes,
  runRecording,
  type ReplayRunnerOptions,
  type ReplayStreamRegistry,
  type ReplayTrace,
} from "../../src/simulation/ReplayVerifier";
import type {
  ReplayRecording,
  ReplayTickSeed,
} from "../../src/simulation/ReplayRecording";

const C = 0x6d2b79f5;

class DrawSystem implements HarnessSystem {
  draws: number[] = [];
  constructor(private readonly getStream: (name: string) => SeedRng) {}
  tick(): void {
    this.draws.push(this.getStream("alpha").nextInt(100));
  }
  snapshot(): unknown {
    return { draws: [...this.draws] };
  }
  restore(state: unknown): void {
    this.draws = [...(state as { draws: number[] }).draws];
  }
}

function streamSeeds(
  stream: string,
  maxTick: number,
  start: number,
  drawsPerTick: number,
): ReplayRecording["tickSeeds"] {
  const out: ReplayTickSeed[] = [];
  let s = start >>> 0;
  for (let t = 1; t <= maxTick; t++) {
    out.push({ tick: t, seeds: [{ stream, state: s }] });
    for (let d = 0; d < drawsPerTick; d++) s = (s + C) >>> 0;
  }
  return out;
}

function drawRecording(maxTick: number, start: number): ReplayRecording {
  return {
    version: 1,
    schema: "draw",
    initialSeed: start,
    maxTick,
    inputs: [],
    tickSeeds: streamSeeds("alpha", maxTick, start, 1),
  };
}

function drawOptions(): ReplayRunnerOptions {
  return {
    makeSystems: (streams: ReplayStreamRegistry) => [
      new DrawSystem((n) => streams.get(n)),
    ],
  };
}

describe("ReplayVerifier: reproduce authoritative hashes", () => {
  it("produces one hash per tick for a valid recording", () => {
    const rec = drawRecording(4, 123456789);
    const trace = runRecording(rec, drawOptions());
    expect(trace.divergence).toBeNull();
    expect(trace.version).toBe("v1");
    expect(trace.ticks.map((t) => t.tick)).toEqual([1, 2, 3, 4]);
    expect(trace.ticks).toHaveLength(4);
  });
});

describe("ReplayVerifier: cross-run reproducibility", () => {
  it("two fresh runs are identical tick-for-tick", () => {
    const rec = drawRecording(5, 777);
    const a = runRecording(rec, drawOptions());
    const b = runRecording(rec, drawOptions());
    expect(a).toEqual(b);
    expect(a.ticks.map((t) => t.hash)).toEqual(b.ticks.map((t) => t.hash));
  });
});

describe("ReplayVerifier: deterministic seeding", () => {
  it("seeds the stream to the recorded state and the system consumes the governed instance", () => {
    const created: SeedRng[] = [];
    const seedStreams = (_name: string, state: number): SeedRng => {
      const r = new SeedRng(state);
      created.push(r);
      return r;
    };
    let captured: SeedRng | null = null;
    class ProbeSystem implements HarnessSystem {
      tick(): void {
        captured = this.streams.get("alpha");
      }
      snapshot(): unknown {
        return {};
      }
      restore(): void {}
      constructor(private readonly streams: ReplayStreamRegistry) {}
    }
    const rec = drawRecording(3, 4242);
    runRecording(rec, {
      makeSystems: (streams) => [new ProbeSystem(streams)],
      seedStreams,
    });
    expect(captured).not.toBeNull();
    expect(created.length).toBeGreaterThanOrEqual(1);
    // The instance consumed during tick 1 is exactly the one the factory created for that tick.
    expect(captured).toBe(created[0]);
    expect(captured!.state).toBe(rec.tickSeeds[0]!.seeds[0]!.state);
  });

  it("reports seed_mismatch at the tick where a tampered seed no longer reproduces", () => {
    const rec = drawRecording(4, 1000);
    const tampered: ReplayRecording = {
      ...rec,
      tickSeeds: rec.tickSeeds.map((ts, i) =>
        i === 0
          ? {
              tick: ts.tick,
              seeds: [
                {
                  stream: "alpha",
                  state: (ts.seeds[0]!.state ^ 0xabcdef) >>> 0,
                },
              ],
            }
          : ts,
      ),
    };
    const trace = runRecording(tampered, drawOptions());
    const div = trace.divergence!;
    expect(div).not.toBeNull();
    expect(div.kind).toBe("seed_mismatch");
    expect(div.kind === "seed_mismatch" && div.tick).toBe(2);
    expect(div.kind === "seed_mismatch" && div.stream).toBe("alpha");
  });
});

describe("ReplayVerifier: divergence diagnosis", () => {
  function traceOf(
    hashes: number[],
    version = "v1",
    divergence = null as ReplayTrace["divergence"],
  ): ReplayTrace {
    return {
      version,
      ticks: hashes.map((h, i) => ({ tick: i + 1, hash: h })),
      divergence,
    };
  }

  it("reports the first diverging tick as a hash divergence", () => {
    const expected = traceOf([10, 20, 30]);
    const actual = traceOf([10, 20, 99]);
    const cmp = compareHashes(expected, actual);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence).toEqual({
      kind: "hash",
      tick: 3,
      expected: 30,
      actual: 99,
    });
  });

  it("reports identical and empty traces without error", () => {
    const a = traceOf([1, 2, 3]);
    const b = traceOf([1, 2, 3]);
    expect(compareHashes(a, b).identical).toBe(true);
    const empty = traceOf([]);
    expect(compareHashes(empty, traceOf([])).identical).toBe(true);
  });

  it("refuses cross-version comparison with version_mismatch", () => {
    const a = traceOf([1], "v1");
    const b = traceOf([1], "v2");
    const cmp = compareHashes(a, b);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence).toEqual({
      kind: "version_mismatch",
      expected: "v1",
      actual: "v2",
    });
  });
});

describe("ReplayVerifier: failure and version handling", () => {
  class ThrowingSystem implements HarnessSystem {
    tick(t: number): void {
      if (t === 4) throw new Error("boom at 4");
    }
    snapshot(): unknown {
      return {};
    }
    restore(): void {}
  }

  it("surfaces a mid-replay system failure naming the tick, hashing no later ticks", () => {
    const rec = drawRecording(6, 555);
    const trace = runRecording(rec, {
      makeSystems: (streams) => [
        new ThrowingSystem(),
        new DrawSystem((n) => streams.get(n)),
      ],
    });
    const div = trace.divergence!;
    expect(div).not.toBeNull();
    expect(div.kind).toBe("system_failure");
    expect(div.kind === "system_failure" && div.tick).toBe(4);
    expect(div.kind === "system_failure" && div.error).toBeInstanceOf(Error);
    expect(trace.ticks.map((t) => t.tick)).toEqual([1, 2, 3]);
  });

  it("rejects an unsupported recording version", () => {
    const rec = { ...drawRecording(2, 1), version: 2 } as ReplayRecording;
    expect(() => runRecording(rec, drawOptions())).toThrow(
      /unsupported recording version/,
    );
  });

  it("rejects a recording missing a tick seed before any tick runs", () => {
    const rec: ReplayRecording = {
      version: 1,
      schema: "x",
      initialSeed: 1,
      maxTick: 3,
      inputs: [],
      tickSeeds: drawRecording(3, 1).tickSeeds.slice(0, 2),
    };
    expect(() => runRecording(rec, drawOptions())).toThrow(/missing_seed/);
  });

  it("never calls a failure-expecting trace identical to a successful run", () => {
    const success = runRecording(drawRecording(4, 321), drawOptions());
    expect(success.divergence).toBeNull();
    const expectedFailure: ReplayTrace = {
      version: "v1",
      ticks: success.ticks.slice(0, 3),
      divergence: {
        kind: "system_failure",
        tick: 4,
        error: new Error("expected"),
      },
    };
    const cmp = compareHashes(expectedFailure, success);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence!.kind).toBe("system_failure");
  });
});

describe("ReplayVerifier: integration with WorldTickProcess", () => {
  it("reproduced hashes match a fresh run and the production driver path", () => {
    const maxTick = 5;
    const start = 90909;

    // Production path: WorldTickProcess drives a persistent named stream once per tick.
    const alpha = new SeedRng(start);
    const prodSys = new DrawSystem(() => alpha);
    const process = new WorldTickProcess({ systems: [prodSys] });
    process.step(maxTick);
    const prodDraws = [...prodSys.draws];

    // Replay path: the verifier reproduces authoritative hashes from the recording.
    const rec = drawRecording(maxTick, start);
    const trace = runRecording(rec, drawOptions());
    expect(trace.divergence).toBeNull();
    expect(trace.ticks).toHaveLength(maxTick);

    // Cross-run reproducibility.
    const again = runRecording(rec, drawOptions());
    expect(again.ticks.map((t) => t.hash)).toEqual(
      trace.ticks.map((t) => t.hash),
    );

    // The last authoritative snapshot equals the production-driven state, tying the
    // verifier hash scheme to the production driver's output.
    const last = trace.ticks[maxTick - 1]!;
    expect(last.tick).toBe(maxTick);
    expect(last.hash).toBe(
      hashState({ tick: maxTick, systems: [{ draws: prodDraws }] }),
    );
  });
});

// ── Remaining ReplayVerifier branches (verification campaign) ────────────────

describe("ReplayVerifier: remaining divergence branches", () => {
  it("detects a seed_mismatch when the next tick's recorded state disagrees with reality", () => {
    const rec = {
      ...drawRecording(4, 900),
      tickSeeds: drawRecording(4, 900).tickSeeds.map((ts) =>
        ts.tick === 3
          ? {
              ...ts,
              seeds: [
                {
                  stream: ts.seeds[0]!.stream,
                  state: (ts.seeds[0]!.state + 123456) >>> 0,
                },
              ],
            }
          : ts,
      ),
    } as ReplayRecording;
    // Corrupt the recorded pre-tick state for tick 3 so reality diverges from the ledger.
    const trace = runRecording(rec, drawOptions());
    expect(trace.divergence?.kind).toBe("seed_mismatch");
    if (trace.divergence?.kind === "seed_mismatch") {
      expect(trace.divergence.stream).toBe("alpha");
      expect(trace.divergence.expected).not.toBe(trace.divergence.actual);
    }
    expect(trace.ticks.length).toBe(2); // ticks 1-2 hashed before the mismatch at 3
  });

  it("rejects an unsupported recording version", () => {
    const rec = {
      ...drawRecording(2, 5),
      version: 99,
    } as unknown as ReplayRecording;
    expect(() => runRecording(rec, drawOptions())).toThrow(
      /unsupported recording version 99/,
    );
  });

  function traceOf(
    hashes: number[],
    version = "v1",
    divergence: ReplayTrace["divergence"] = null,
  ): ReplayTrace {
    return {
      version,
      ticks: hashes.map((h, i) => ({ tick: i + 1, hash: h })),
      divergence,
    };
  }

  it("flags different-length clean traces at the first missing tail tick", () => {
    const cmp = compareHashes(traceOf([1, 2, 3]), traceOf([1, 2]));
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence?.kind).toBe("hash");
    expect(
      cmp.firstDivergence &&
        "tick" in cmp.firstDivergence &&
        cmp.firstDivergence.tick,
    ).toBe(3);
  });

  it("treats equal divergences of the same kind as identical replays", () => {
    const d1 = traceOf([], "v1", {
      kind: "system_failure",
      tick: 4,
      error: new Error("boom"),
    });
    const d2 = traceOf([], "v1", {
      kind: "system_failure",
      tick: 4,
      error: new Error("boom"),
    });
    expect(compareHashes(d1, d2)).toEqual({
      identical: true,
      firstDivergence: null,
    });

    const m1 = traceOf([], "v1", { kind: "missing_seed", tick: 7 });
    const m2 = traceOf([], "v1", { kind: "missing_seed", tick: 7 });
    expect(compareHashes(m1, m2).identical).toBe(true);

    const s1 = traceOf([], "v1", {
      kind: "seed_mismatch",
      tick: 3,
      stream: "a",
      expected: 1,
      actual: 2,
    });
    const s2 = traceOf([], "v1", {
      kind: "seed_mismatch",
      tick: 3,
      stream: "a",
      expected: 1,
      actual: 2,
    });
    expect(compareHashes(s1, s2).identical).toBe(true);

    // Same kind but different payload → not identical; the earlier-tick side wins.
    const s3 = {
      ...s1,
      divergence: {
        kind: "seed_mismatch",
        tick: 2,
        stream: "a",
        expected: 1,
        actual: 2,
      } as const,
    };
    const cmp = compareHashes(s1, s3);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence).toEqual(s3.divergence);
  });

  it("mismatched divergence kinds report the single-sided divergence (outcome class differs)", () => {
    const clean = traceOf([1, 2]);
    const failed = traceOf([1], "v1", {
      kind: "system_failure",
      tick: 2,
      error: new Error("boom"),
    });
    const cmp = compareHashes(clean, failed);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence).toEqual(failed.divergence);
  });
});
