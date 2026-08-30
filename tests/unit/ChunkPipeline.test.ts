import { describe, it, expect } from "vitest";
import {
  ChunkPipeline,
  CHUNK_PIPELINE_QUEUE_CAPS,
  UNLOAD_HYSTERESIS_CHUNKS,
} from "../../src/world/ChunkPipeline";
import { ChunkStreamPriority } from "../../src/world/ChunkTicket";
import { createChunkWorkPriority } from "../../src/world/ChunkWorkPriority";

describe("ChunkPipeline — displaced-count accounting", () => {
  function pipelineWithFullQueue(): ChunkPipeline {
    const pipeline = new ChunkPipeline();
    const cap = CHUNK_PIPELINE_QUEUE_CAPS.generate;
    for (let i = 0; i < cap; i++) {
      expect(pipeline.register(0, 0, i).key).toBeDefined();
      expect(
        pipeline.enqueue("generate", 0, 0, i, ChunkStreamPriority.Rings),
      ).toBe(true);
    }
    return pipeline;
  }

  it("counts each displacement and resets on takeDisplacedCount", () => {
    const pipeline = pipelineWithFullQueue();
    // Two strictly-more-urgent enqueues displace two worst jobs.
    for (const cz of [100, 101]) {
      pipeline.register(0, 0, cz);
      expect(
        pipeline.enqueue("generate", 0, 0, cz, ChunkStreamPriority.VisibleNear),
      ).toBe(true);
    }
    expect(pipeline.takeDisplacedCount()).toBe(2);
    expect(pipeline.takeDisplacedCount()).toBe(0); // reset after read
  });

  it("a non-displacing enqueue leaves the counter untouched", () => {
    const pipeline = pipelineWithFullQueue();
    pipeline.register(9, 9, 9);
    // Queue not full in a fresh stage → no displacement possible.
    expect(pipeline.enqueue("mesh", 9, 9, 9, ChunkStreamPriority.Preload)).toBe(
      true,
    );
    expect(pipeline.takeDisplacedCount()).toBe(0);
  });
});

describe("ChunkPipeline — bounded enqueue rejection", () => {
  it("returns false at cap when the new job is not strictly more urgent, keeping the worst job intact", () => {
    const pipeline = new ChunkPipeline(() => 1000); // frozen clock: stable enqueuedAtMs ordering
    const cap = CHUNK_PIPELINE_QUEUE_CAPS.upload;
    for (let i = 0; i < cap; i++) {
      pipeline.register(i, 0, 0);
      expect(
        pipeline.enqueue("upload", i, 0, 0, ChunkStreamPriority.Preload),
      ).toBe(true);
    }

    // Equal priority is NOT strictly more urgent → rejected.
    pipeline.register(cap, 0, 0);
    expect(
      pipeline.enqueue("upload", cap, 0, 0, ChunkStreamPriority.Preload),
    ).toBe(false);
    expect(pipeline.queueDepth("upload")).toBe(cap);

    // The worst queued entry survived the rejection.
    const worst = pipeline.dequeue("upload");
    expect(worst).toBeDefined();
    expect(worst!.priority).toBe(ChunkStreamPriority.Preload);
    expect(worst!.cx).toBe(0); // oldest of the equal-priority entries
  });

  it("displacement replaces exactly one worst job with the more urgent newcomer", () => {
    const pipeline = new ChunkPipeline(() => 500);
    const cap = CHUNK_PIPELINE_QUEUE_CAPS.mesh;
    for (let i = 0; i < cap; i++) {
      pipeline.register(i, 1, 1);
      expect(
        pipeline.enqueue("mesh", i, 1, 1, ChunkStreamPriority.ForwardCorridor),
      ).toBe(true);
    }

    pipeline.register(cap, 1, 1);
    expect(
      pipeline.enqueue("mesh", cap, 1, 1, ChunkStreamPriority.VisibleNear),
    ).toBe(true);
    expect(pipeline.queueDepth("mesh")).toBe(cap);
    expect(pipeline.takeDisplacedCount()).toBe(1);

    let sawNewcomer = false;
    let preloadsLeftBehind = 0;
    for (
      let job = pipeline.dequeue("mesh");
      job;
      job = pipeline.dequeue("mesh")
    ) {
      if (job.cx === cap) sawNewcomer = true;
      else preloadsLeftBehind++;
    }
    expect(sawNewcomer).toBe(true);
    expect(preloadsLeftBehind).toBe(cap - 1);
  });
});

describe("ChunkPipeline — unload hysteresis", () => {
  it("holds chunks between loadRadius and loadRadius + hysteresis", () => {
    const pipeline = new ChunkPipeline();
    const rd = 4;

    expect(pipeline.shouldLoad(rd, 0, rd)).toBe(true);
    expect(pipeline.shouldUnload(rd, 0, rd)).toBe(false); // inside load radius
    expect(pipeline.shouldUnload(rd + UNLOAD_HYSTERESIS_CHUNKS, 0, rd)).toBe(
      false,
    ); // held ring
    expect(
      pipeline.shouldUnload(rd + UNLOAD_HYSTERESIS_CHUNKS + 1, 0, rd),
    ).toBe(true);

    // Chebyshev metric: corners count as their max axis distance.
    expect(pipeline.shouldUnload(rd + 1, rd + 1, rd)).toBe(false); // still held ring
    expect(pipeline.shouldUnload(rd + 2, rd + 2, rd)).toBe(true);
  });
});
// ── Comprehensive lifecycle coverage (verification campaign) ─────────────────

import {
  packChunkCoords,
  unpackPackedKey,
} from "../../src/world/ChunkPipeline";
import {
  ChunkLifecycleStage,
  canTransition,
} from "../../src/world/ChunkStatus";
import {
  createChunkTicket,
  ChunkTicketType,
} from "../../src/world/ChunkTicket";

describe("ChunkPipeline — packed coordinate keys", () => {
  it("round-trips positive, negative and boundary coordinates", () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [1, 2, 3],
      [-1, -2, -3],
      [32767, -32768, 12345],
      [-32768, 32767, -1],
    ];
    for (const [x, y, z] of cases) {
      expect(unpackPackedKey(packChunkCoords(x, y, z))).toEqual([x, y, z]);
    }
  });

  it("produces safe-integer keys", () => {
    const a = packChunkCoords(1, 2, 3);
    const b = packChunkCoords(3, 2, 1);
    expect(a).not.toBe(b);
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(Number.isSafeInteger(b)).toBe(true);
  });
});

describe("ChunkPipeline — registration and lookup", () => {
  it("register is idempotent and lookups agree across key forms", () => {
    const pipeline = new ChunkPipeline();
    const first = pipeline.register(4, 5, 6);
    const second = pipeline.register(4, 5, 6);
    expect(second).toBe(first);
    expect(first.status).toBe(ChunkLifecycleStage.Allocated);
    expect(pipeline.size).toBe(1);
    expect(pipeline.getRecord("4,5,6")).toBe(first);
    expect(pipeline.getRecordByCoords(4, 5, 6)).toBe(first);
    expect(pipeline.getStatus(4, 5, 6)).toBe(ChunkLifecycleStage.Allocated);
    expect(pipeline.getStatus(9, 9, 9)).toBe(ChunkLifecycleStage.Absent);

    let visited = 0;
    pipeline.forEachRecord(() => visited++);
    expect(visited).toBe(1);
  });

  it("negative coordinates resolve through the packed-key index", () => {
    const pipeline = new ChunkPipeline();
    const record = pipeline.register(-7, -8, -9);
    expect(pipeline.getRecordByCoords(-7, -8, -9)).toBe(record);
    expect(pipeline.getRecord("-7,-8,-9")).toBe(record);
  });
});

describe("ChunkPipeline — tickets", () => {
  function activeTicketOf(
    pipeline: ChunkPipeline,
    cx: number,
    cy: number,
    cz: number,
  ) {
    return pipeline.getRecordByCoords(cx, cy, cz)?.activeTicket ?? null;
  }

  it("refuses tickets for non-resident chunks", () => {
    const pipeline = new ChunkPipeline();
    expect(
      pipeline.acquireTicket(
        0,
        0,
        0,
        createChunkTicket(ChunkTicketType.Player),
      ),
    ).toBeUndefined();
    expect(
      pipeline.releaseTicket(
        0,
        0,
        0,
        createChunkTicket(ChunkTicketType.Player),
      ),
    ).toBe(false);
  });

  it("stamps issuedAt on expiring tickets and refuses already-expired ones", () => {
    let now = 1000;
    const pipeline = new ChunkPipeline(() => now);
    pipeline.register(1, 1, 1);

    const record = pipeline.acquireTicket(1, 1, 1, {
      type: ChunkTicketType.Portal,
      level: 31,
      expiresAt: 2000,
    });
    expect(record).toBeDefined();
    expect(record!.tickets[0]!.issuedAt).toBe(1000); // stamped from the clock

    const expired = pipeline.acquireTicket(1, 1, 1, {
      type: ChunkTicketType.Portal,
      level: 31,
      issuedAt: 0,
      expiresAt: 500, // already past at now=1000
    });
    expect(expired).toBeUndefined();

    now = 2500; // the first ticket expires too
    expect(pipeline.expireTickets()).toBe(1);
    expect(pipeline.hasTicket(1, 1, 1)).toBe(false);
    expect(activeTicketOf(pipeline, 1, 1, 1)).toBeNull();
  });

  it("refuses stale-version tickets but stamps unversioned tickets with the chunk generation", () => {
    const pipeline = new ChunkPipeline();
    const record = pipeline.register(2, 2, 2);
    record.generation = 3;

    const stale = pipeline.acquireTicket(2, 2, 2, {
      type: ChunkTicketType.Player,
      level: 31,
      version: 2,
    });
    expect(stale).toBeUndefined(); // version < generation → stale

    const ok = pipeline.acquireTicket(2, 2, 2, {
      type: ChunkTicketType.Player,
      level: 31,
    });
    expect(ok).toBeDefined();
    expect(ok!.tickets[0]!.version).toBe(3); // stamped
  });

  it("activeTicket tracks the strongest live ticket; effectivePriority follows it", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(3, 3, 3);

    pipeline.acquireTicket(3, 3, 3, {
      type: ChunkTicketType.Preload,
      level: 40,
    });
    pipeline.acquireTicket(3, 3, 3, {
      type: ChunkTicketType.Player,
      level: 31,
    });

    // Player ticket wins (lower level).
    expect(activeTicketOf(pipeline, 3, 3, 3)?.type).toBe(
      ChunkTicketType.Player,
    );
    expect(pipeline.effectivePriority(3, 3, 3)).toBe(
      ChunkStreamPriority.VisibleNear,
    );

    const strong = { type: ChunkTicketType.Player, level: 31, version: 0 };
    expect(pipeline.releaseTicket(3, 3, 3, strong)).toBe(true);
    expect(pipeline.releaseTicket(3, 3, 3, strong)).toBe(false); // gone
    expect(activeTicketOf(pipeline, 3, 3, 3)?.type).toBe(
      ChunkTicketType.Preload,
    );

    // Unticketed chunks default to the weakest streaming priority.
    pipeline.register(4, 4, 4);
    expect(pipeline.effectivePriority(4, 4, 4)).toBe(
      ChunkStreamPriority.Preload,
    );
  });

  it("release matches on type/level/priority/version, not object identity", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(5, 5, 5);
    const stamped = { type: ChunkTicketType.Light, level: 33 };
    pipeline.acquireTicket(5, 5, 5, stamped);

    // acquireTicket stamped version=0 onto its stored copy; a lookalike carrying that same
    // version matches without being the identical object.
    const lookalike = { type: ChunkTicketType.Light, level: 33, version: 0 };
    expect(pipeline.releaseTicket(5, 5, 5, lookalike)).toBe(true);
    expect(pipeline.hasTicket(5, 5, 5)).toBe(false);
  });

  it("getTickets returns a snapshot copy", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(6, 6, 6);
    pipeline.acquireTicket(6, 6, 6, {
      type: ChunkTicketType.Simulation,
      level: 31,
    });
    const snapshot = pipeline.getTickets(6, 6, 6);
    expect(snapshot.length).toBe(1);
    pipeline.expireTickets();
    expect(snapshot.length).toBe(1); // unaffected by later mutation
    expect(pipeline.getTickets(9, 9, 9)).toEqual([]);
  });
});

describe("ChunkPipeline — neighbor dependencies", () => {
  it("neighborsReady requires every declared neighbor to reach the minimum stage", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    const b = pipeline.register(1, 0, 0);
    const c = pipeline.register(-1, 0, 0);
    pipeline.setNeighbors("0,0,0", ["1,0,0", "-1,0,0"]);

    expect(
      pipeline.neighborsReady("0,0,0", ChunkLifecycleStage.Allocated),
    ).toBe(true);

    b.status = ChunkLifecycleStage.Generated;
    c.status = ChunkLifecycleStage.Generated;
    expect(
      pipeline.neighborsReady("0,0,0", ChunkLifecycleStage.Generated),
    ).toBe(true);
    expect(pipeline.neighborsReady("0,0,0", ChunkLifecycleStage.Features)).toBe(
      false,
    );

    // An unknown neighbor counts as not ready.
    pipeline.setNeighbors("0,0,0", ["1,0,0", "99,99,99"]);
    expect(
      pipeline.neighborsReady("0,0,0", ChunkLifecycleStage.Allocated),
    ).toBe(false);

    // Unknown subject chunk is not ready either; setNeighbors on unknown is a no-op.
    expect(
      pipeline.neighborsReady("40,40,40", ChunkLifecycleStage.Absent),
    ).toBe(false);
    expect(() => pipeline.setNeighbors("40,40,40", [])).not.toThrow();
  });
});

describe("ChunkPipeline — stage transitions", () => {
  it("begin + complete walk generate/features/light forward one step each", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);

    expect(pipeline.beginStage("0,0,0", "generate")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 0)).toBe(ChunkLifecycleStage.Allocated); // no begin status
    expect(pipeline.completeStage("0,0,0", "generate")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 0)).toBe(ChunkLifecycleStage.Generated);

    expect(pipeline.beginStage("0,0,0", "features")).toEqual({ ok: true });
    expect(pipeline.completeStage("0,0,0", "features")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 0)).toBe(ChunkLifecycleStage.Features);

    expect(pipeline.beginStage("0,0,0", "light")).toEqual({ ok: true });
    expect(pipeline.completeStage("0,0,0", "light")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 0)).toBe(ChunkLifecycleStage.Lighted);
  });

  it("mesh and upload advance to their queued begin-status first", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 1);
    for (const stage of ["generate", "features", "light"] as const) {
      pipeline.beginStage("0,0,1", stage);
      pipeline.completeStage("0,0,1", stage);
    }

    expect(pipeline.beginStage("0,0,1", "mesh")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 1)).toBe(ChunkLifecycleStage.MeshQueued);
    expect(pipeline.completeStage("0,0,1", "mesh")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 1)).toBe(ChunkLifecycleStage.MeshReadyCpu);

    expect(pipeline.beginStage("0,0,1", "upload")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 1)).toBe(ChunkLifecycleStage.UploadQueued);
    expect(pipeline.completeStage("0,0,1", "upload")).toEqual({ ok: true });
    expect(pipeline.getStatus(0, 0, 1)).toBe(ChunkLifecycleStage.ActiveGpu);
  });

  it("rejects every failure reason without mutating state", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 1, 0);

    // unknown-chunk
    expect(pipeline.beginStage("nope", "generate").reason).toBe(
      "unknown-chunk",
    );
    expect(pipeline.completeStage("nope", "generate").reason).toBe(
      "unknown-chunk",
    );
    expect(pipeline.failStage("nope", "generate").reason).toBe("unknown-chunk");

    // stale-token
    expect(pipeline.beginStage("0,1,0", "generate", 7).reason).toBe(
      "stale-token",
    );
    expect(pipeline.completeStage("0,1,0", "generate", 7).reason).toBe(
      "stale-token",
    );
    expect(pipeline.beginStage("0,1,0", "generate")).toEqual({ ok: true });
    expect(pipeline.completeStage("0,1,0", "generate", 7).reason).toBe(
      "stale-token",
    );

    // already-in-flight
    expect(pipeline.beginStage("0,1,0", "generate").reason).toBe(
      "already-in-flight",
    );
    expect(pipeline.completeStage("0,1,0", "generate")).toEqual({ ok: true });

    // complete/fail a stage that was never begun
    expect(pipeline.completeStage("0,1,0", "mesh").reason).toBe(
      "already-in-flight",
    );
    expect(pipeline.failStage("0,1,0", "mesh").reason).toBe(
      "already-in-flight",
    );

    // invalid transition: light cannot begin from Generated (features must come first)
    expect(pipeline.beginStage("0,1,0", "light").reason).toBe(
      "invalid-transition",
    );
  });

  it("failStage rolls back mesh begin-status and bumps the generation", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(1, 1, 1);
    for (const stage of ["generate", "features", "light"] as const) {
      pipeline.beginStage("1,1,1", stage);
      pipeline.completeStage("1,1,1", stage);
    }
    const generationBefore = pipeline.getRecord("1,1,1")!.generation;

    pipeline.beginStage("1,1,1", "mesh");
    expect(pipeline.getStatus(1, 1, 1)).toBe(ChunkLifecycleStage.MeshQueued);
    expect(pipeline.failStage("1,1,1", "mesh")).toEqual({ ok: true });
    expect(pipeline.getStatus(1, 1, 1)).toBe(ChunkLifecycleStage.Lighted); // rolled back
    expect(pipeline.getRecord("1,1,1")!.generation).toBe(generationBefore + 1);
  });

  it("failing generate (no begin-status) leaves status untouched and invalidates captured tokens", () => {
    const pipeline = new ChunkPipeline();
    const record = pipeline.register(2, 1, 0);
    pipeline.enqueue("generate", 2, 1, 0, ChunkStreamPriority.Rings);
    const versionAtEnqueue = pipeline.dequeue("generate")!.version;

    // failStage requires the stage to have been begun (generate has no begin-status, so the
    // status stays Allocated while the in-flight marker is set).
    expect(pipeline.beginStage("2,1,0", "generate")).toEqual({ ok: true });
    expect(pipeline.failStage("2,1,0", "generate")).toEqual({ ok: true });
    expect(record.status).toBe(ChunkLifecycleStage.Allocated);
    expect(record.generation).toBe(versionAtEnqueue + 1);
  });

  it("completeStage stamps lastStageDurationMs from the clock", () => {
    let now = 100;
    const pipeline = new ChunkPipeline(() => now);
    pipeline.register(0, 2, 0);
    pipeline.beginStage("0,2,0", "generate");
    now = 160;
    pipeline.completeStage("0,2,0", "generate");
    expect(pipeline.getRecord("0,2,0")!.lastStageDurationMs).toBe(60);
  });
});

describe("ChunkPipeline — queue dispatch semantics", () => {
  it("dequeue picks lowest priority value, FIFO within equal priority", () => {
    const pipeline = new ChunkPipeline();
    for (const [coords, priority] of [
      [[0, 0, 0], ChunkStreamPriority.Rings],
      [[1, 0, 0], ChunkStreamPriority.VisibleNear],
      [[2, 0, 0], ChunkStreamPriority.Rings],
    ] as const) {
      pipeline.register(coords[0], coords[1], coords[2]);
      expect(
        pipeline.enqueue("generate", coords[0], coords[1], coords[2], priority),
      ).toBe(true);
    }

    expect(pipeline.dequeue("generate")!.cx).toBe(1); // most urgent
    expect(pipeline.dequeue("generate")!.cx).toBe(0); // older of the equal-priority pair
    expect(pipeline.dequeue("generate")!.cx).toBe(2);
    expect(pipeline.dequeue("generate")).toBeUndefined();
  });

  it("dispatches custom visibility and movement priority before age within one urgency tier", () => {
    const pipeline = new ChunkPipeline(() => 100);
    const far = pipeline.register(0, 0, 0);
    const forward = pipeline.register(1, 0, 0);
    const farPriority = createChunkWorkPriority(ChunkStreamPriority.Rings, 2, 2, 1, 0, 8);
    const forwardPriority = createChunkWorkPriority(ChunkStreamPriority.Rings, 0, 0, 1, 0, 8);
    expect(pipeline.enqueue("generate", far.cx, far.cy, far.cz, ChunkStreamPriority.Rings, farPriority)).toBe(true);
    expect(pipeline.enqueue("generate", forward.cx, forward.cy, forward.cz, ChunkStreamPriority.Rings, forwardPriority)).toBe(true);
    expect(pipeline.dequeue("generate")?.key).toBe("1,0,0");
  });

  it("displaces same-urgency speculative work when visibility is better", () => {
    const pipeline = new ChunkPipeline(() => 500);
    const cap = CHUNK_PIPELINE_QUEUE_CAPS.generate;
    for (let i = 0; i < cap; i++) {
      pipeline.register(i, 0, 1);
      const details = createChunkWorkPriority(ChunkStreamPriority.Rings, 2, 2, 1, 0, 8);
      expect(pipeline.enqueue("generate", i, 0, 1, ChunkStreamPriority.Rings, details)).toBe(true);
    }

    pipeline.register(cap, 0, 1);
    const urgent = createChunkWorkPriority(ChunkStreamPriority.Rings, 0, 0, 0, 0, 1);
    expect(pipeline.enqueue("generate", cap, 0, 1, ChunkStreamPriority.Rings, urgent)).toBe(true);
    expect(pipeline.takeDisplacedCount()).toBe(1);
    expect(pipeline.dequeue("generate")?.key).toBe(`${cap},0,1`);
  });

  it("dispatches interactive work before far speculative generation under saturation", () => {
    const pipeline = new ChunkPipeline(() => 500);
    const cap = CHUNK_PIPELINE_QUEUE_CAPS.generate;
    for (let i = 0; i < cap; i++) {
      pipeline.register(100 + i, 0, 100);
      const far = createChunkWorkPriority(ChunkStreamPriority.Preload, 2, 2, 1, 0, 12);
      expect(pipeline.enqueue("generate", 100 + i, 0, 100, ChunkStreamPriority.Preload, far)).toBe(true);
    }

    pipeline.register(0, 0, 0);
    const interactive = createChunkWorkPriority(ChunkStreamPriority.Interaction, 0, 0, 0, 0, 2);
    expect(pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Interaction, interactive)).toBe(true);
    expect(pipeline.takeDisplacedCount()).toBe(1);
    expect(pipeline.dequeue("generate")?.key).toBe("0,0,0");
  });

  it("preserves an explicit priority tuple when a dequeued job is requeued", () => {
    const pipeline = new ChunkPipeline(() => 100);
    pipeline.register(4, 0, 4);
    const details = createChunkWorkPriority(ChunkStreamPriority.ForwardCorridor, 0, 0, 0, 0, 4);
    expect(pipeline.enqueue("mesh", 4, 0, 4, ChunkStreamPriority.ForwardCorridor, details)).toBe(true);
    const job = pipeline.dequeue("mesh");
    expect(job?.priorityDetails).toEqual(details);
    expect(pipeline.enqueue("mesh", job!.cx, job!.cy, job!.cz, job!.priority, job!.priorityDetails)).toBe(true);
    expect(pipeline.dequeue("mesh")?.priorityDetails).toEqual(details);
  });
  it("dequeue silently drops entries whose chunk vanished or whose token went stale", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    pipeline.register(1, 0, 0);
    pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings);
    pipeline.enqueue("generate", 1, 0, 0, ChunkStreamPriority.Rings);
    pipeline.cancelForKey("0,0,0"); // generation bump makes the queued job stale

    const job = pipeline.dequeue("generate")!;
    expect(job.cx).toBe(1); // stale entry skipped, not returned
    expect(pipeline.queueDepth("generate")).toBe(0);
  });

  it("dequeue drops entries whose chunk has that stage in flight; they must be re-queued", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    pipeline.register(1, 0, 0);
    pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.VisibleNear);
    pipeline.enqueue("generate", 1, 0, 0, ChunkStreamPriority.Rings);
    pipeline.beginStage("0,0,0", "generate");

    // In-flight work is not dispatchable: its queued entry is dropped so a later dequeue
    // cannot double-dispatch it.
    expect(pipeline.dequeue("generate")!.cx).toBe(1);
    expect(pipeline.queueDepth("generate")).toBe(0);

    pipeline.completeStage("0,0,0", "generate");
    expect(pipeline.dequeue("generate")).toBeUndefined(); // dropped earlier; caller re-enqueues

    // Re-enqueueing after completion dispatches normally against the unchanged generation.
    expect(
      pipeline.enqueue("features", 0, 0, 0, ChunkStreamPriority.VisibleNear),
    ).toBe(true);
    expect(pipeline.dequeue("features")!.cx).toBe(0);
  });

  it("cancelJobsBelowPriority cancels only strictly worse priorities across all stages", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    pipeline.register(1, 0, 0);
    pipeline.register(2, 0, 0);
    pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Interaction);
    pipeline.enqueue("generate", 1, 0, 0, ChunkStreamPriority.Rings);
    pipeline.enqueue("mesh", 2, 0, 0, ChunkStreamPriority.Preload);

    expect(
      pipeline.cancelJobsBelowPriority(ChunkStreamPriority.Interaction),
    ).toBe(2);
    expect(pipeline.queueDepth("generate")).toBe(1);
    expect(pipeline.queueDepth("mesh")).toBe(0);
  });

  it("cancels queued speculative work without touching in-flight work", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    pipeline.register(1, 0, 0);
    expect(pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings)).toBe(true);
    expect(pipeline.enqueue("generate", 1, 0, 0, ChunkStreamPriority.Interaction)).toBe(true);
    expect(pipeline.beginStage("0,0,0", "generate").ok).toBe(true);

    expect(pipeline.cancelJobsBelowPriority(ChunkStreamPriority.Interaction)).toBe(1);
    expect(pipeline.queueDepth("generate")).toBe(1);
    expect(pipeline.dequeue("generate")?.key).toBe("1,0,0");
    expect(pipeline.getRecord("0,0,0")?.inFlight.has("generate")).toBe(true);
  });

  it("cancelForKey clears queues, in-flight markers and tickets, bumping the generation", () => {
    const pipeline = new ChunkPipeline();
    const record = pipeline.register(0, 3, 0);
    pipeline.enqueue("generate", 0, 3, 0, ChunkStreamPriority.Rings);
    pipeline.acquireTicket(0, 3, 0, {
      type: ChunkTicketType.Player,
      level: 31,
    });
    pipeline.beginStage("0,3,0", "generate");
    const before = record.generation;

    expect(pipeline.cancelForKey("0,3,0")).toBe(true);
    expect(record.tickets.length).toBe(0);
    expect(record.inFlight.size).toBe(0);
    expect(record.generation).toBe(before + 1);
    expect(pipeline.queueDepth("generate")).toBe(0);

    // A repeat cancel is still true (chunk resident) and still bumps: every call invalidates
    // any tokens captured since the previous one.
    expect(pipeline.cancelForKey("0,3,0")).toBe(true);
    expect(record.generation).toBe(before + 2);
    expect(pipeline.cancelForKey("missing")).toBe(false);
  });

  it("enqueue rejects unknown chunks and deduplicates per stage keeping the earliest entry", () => {
    const pipeline = new ChunkPipeline();
    expect(
      pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings),
    ).toBe(false);
    pipeline.register(0, 0, 0);
    expect(
      pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings),
    ).toBe(true);
    expect(
      pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.VisibleNear),
    ).toBe(true);
    expect(pipeline.queueDepth("generate")).toBe(1);
    expect(pipeline.dequeue("generate")!.priority).toBe(
      ChunkStreamPriority.Rings,
    );
  });
});

describe("ChunkPipeline — eviction lifecycle", () => {
  it("markEvicting cancels work then enters Evicting; finalizeEviction drops the record", () => {
    const pipeline = new ChunkPipeline();
    const record = pipeline.register(0, 0, 5);
    pipeline.enqueue("generate", 0, 0, 5, ChunkStreamPriority.Rings);
    pipeline.acquireTicket(0, 0, 5, {
      type: ChunkTicketType.Player,
      level: 31,
    });

    expect(pipeline.markEvicting("0,0,5")).toEqual({ ok: true });
    expect(record.status).toBe(ChunkLifecycleStage.Evicting);
    expect(record.tickets.length).toBe(0); // cancelForKey detached them
    expect(pipeline.queueDepth("generate")).toBe(0);

    expect(pipeline.finalizeEviction("0,0,5")).toEqual({ ok: true });
    expect(pipeline.getRecord("0,0,5")).toBeUndefined();
    expect(pipeline.size).toBe(0);

    expect(pipeline.markEvicting("0,0,5").reason).toBe("unknown-chunk");
    expect(pipeline.finalizeEviction("0,0,5").reason).toBe("unknown-chunk");
  });

  it("finalizeEviction requires the Evicting state", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 6);
    expect(pipeline.finalizeEviction("0,0,6").reason).toBe(
      "invalid-transition",
    );
    expect(pipeline.size).toBe(1);
  });

  it("markEvicting is rejected when already Evicting (self-transition)", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 7);
    expect(pipeline.markEvicting("0,0,7")).toEqual({ ok: true });
    expect(pipeline.markEvicting("0,0,7").ok).toBe(false);
  });

  it("resetForRegeneration returns a fresh Allocated record carrying generation+1", () => {
    const pipeline = new ChunkPipeline();
    const old = pipeline.register(1, 0, 0);
    old.generation = 4;
    old.status = ChunkLifecycleStage.ActiveGpu;

    const fresh = pipeline.resetForRegeneration("1,0,0");
    expect(fresh).toBeDefined();
    expect(fresh!.status).toBe(ChunkLifecycleStage.Allocated);
    expect(fresh!.generation).toBe(5);
    expect(fresh).not.toBe(old);
    expect(pipeline.getRecordByCoords(1, 0, 0)).toBe(fresh);
    expect(pipeline.resetForRegeneration("missing")).toBeUndefined();
  });

  it("canTransition rejects self-transitions and backward moves", () => {
    expect(
      canTransition(
        ChunkLifecycleStage.Allocated,
        ChunkLifecycleStage.Allocated,
      ),
    ).toBe(false);
    expect(
      canTransition(
        ChunkLifecycleStage.Generated,
        ChunkLifecycleStage.Allocated,
      ),
    ).toBe(false);
    expect(
      canTransition(ChunkLifecycleStage.Evicting, ChunkLifecycleStage.Absent),
    ).toBe(true);
    expect(
      canTransition(ChunkLifecycleStage.Absent, ChunkLifecycleStage.Allocated),
    ).toBe(true);
  });
});

describe("ChunkPipeline — observability", () => {
  it("oldestQueueAgeMs and oldestJobAgeMs report against the injected clock", () => {
    let now = 10_000;
    const pipeline = new ChunkPipeline(() => now);
    expect(pipeline.oldestQueueAgeMs("mesh")).toBe(0);
    expect(pipeline.oldestJobAgeMs()).toBe(0);

    pipeline.register(0, 0, 0);
    pipeline.enqueue("mesh", 0, 0, 0, ChunkStreamPriority.Rings);
    now = 10_750;
    expect(pipeline.oldestQueueAgeMs("mesh")).toBe(750);
    expect(pipeline.oldestJobAgeMs()).toBe(750);

    pipeline.register(0, 0, 1);
    pipeline.enqueue("light", 0, 0, 1, ChunkStreamPriority.Rings);
    expect(pipeline.oldestJobAgeMs()).toBe(750); // mesh job still oldest

    now = 10_000; // clock going backwards clamps at zero
    expect(pipeline.oldestQueueAgeMs("mesh")).toBe(0);
  });

  it("stats() snapshots residents, evicting count, depths and age", () => {
    let now = 5000;
    const pipeline = new ChunkPipeline(() => now);
    pipeline.register(0, 0, 0);
    pipeline.register(0, 0, 1);
    pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings);
    pipeline.markEvicting("0,0,1");
    now = 5500;

    const snapshot = pipeline.stats();
    expect(snapshot.residents).toBe(2);
    expect(snapshot.evicting).toBe(1);
    expect(snapshot.depths.generate).toBe(1);
    expect(snapshot.depths.mesh).toBe(0);
    expect(snapshot.oldestJobAgeMs).toBe(500);
  });

  it("clear() drops all records and queues", () => {
    const pipeline = new ChunkPipeline();
    pipeline.register(0, 0, 0);
    pipeline.register(0, 0, 2);
    pipeline.enqueue("generate", 0, 0, 0, ChunkStreamPriority.Rings);

    pipeline.clear();
    expect(pipeline.size).toBe(0);
    expect(pipeline.queueDepth("generate")).toBe(0);
    expect(pipeline.stats().residents).toBe(0);
  });
});
