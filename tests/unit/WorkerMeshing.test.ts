import { describe, it, expect } from "vitest";
import {
  MeshWorkerClient,
  processMeshSectionRequest,
  sectionLightSampler,
  type MeshSectionRequestPayload,
} from "../../src/rendering/WorkerMeshing";
import {
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
} from "../../src/rendering/GreedyMesher";

const SECTION = 16;

function emptyPayload(): MeshSectionRequestPayload {
  return {
    sectionX: 0,
    sectionY: 0,
    sectionZ: 0,
    cells: new Array(4096).fill(null),
    opaqueIds: [1],
    skyLight: new Array(4096).fill(0),
    blockLight: new Array(4096).fill(0),
  };
}

function cubePayload(): MeshSectionRequestPayload {
  const payload = emptyPayload();
  payload.cells[0] = 1; // cell (0,0,0)
  return payload;
}

function slabPayload(): MeshSectionRequestPayload {
  const payload = emptyPayload();
  payload.cells[0] = 1; // (0,0,0)
  payload.cells[1] = 1; // (1,0,0)
  return payload;
}

function equivalentGreedy(payload: MeshSectionRequestPayload) {
  const opaque = new Set(payload.opaqueIds);
  const sampler: FaceCellSampler = (x, y, z) => {
    const dx = x - payload.sectionX * SECTION;
    const dy = y - payload.sectionY * SECTION;
    const dz = z - payload.sectionZ * SECTION;
    if (
      dx < 0 ||
      dx >= SECTION ||
      dy < 0 ||
      dy >= SECTION ||
      dz < 0 ||
      dz >= SECTION
    )
      return null;
    return payload.cells[dx + dy * SECTION + dz * SECTION * SECTION] ?? null;
  };
  return greedyMergeOpaqueFaces(
    sampler,
    (id) => opaque.has(id),
    (id) => String(id),
    sectionLightSampler(payload),
  );
}

describe("processMeshSectionRequest", () => {
  it("is equivalent to greedyMergeOpaqueFaces on fixtures", () => {
    for (const payload of [emptyPayload(), cubePayload(), slabPayload()]) {
      const result = processMeshSectionRequest(payload);
      expect(result.quads).toEqual(equivalentGreedy(payload));
      expect(result.sectionX).toBe(payload.sectionX);
    }
  });

  it("rejects malformed cells arrays", () => {
    expect(() =>
      processMeshSectionRequest({
        sectionX: 0,
        sectionY: 0,
        sectionZ: 0,
        cells: [1],
        opaqueIds: [],
        skyLight: [],
        blockLight: [],
      }),
    ).toThrow();
  });

  it("rejects malformed light arrays", () => {
    const wrongLength = emptyPayload();
    wrongLength.skyLight = new Array(10).fill(0);
    expect(() => processMeshSectionRequest(wrongLength)).toThrow();

    const outOfRangeSky = emptyPayload();
    outOfRangeSky.skyLight[0] = 16;
    expect(() => processMeshSectionRequest(outOfRangeSky)).toThrow();

    const outOfRangeBlock = emptyPayload();
    outOfRangeBlock.blockLight[5] = -1;
    expect(() => processMeshSectionRequest(outOfRangeBlock)).toThrow();

    const fractional = emptyPayload();
    fractional.blockLight[3] = 7.5;
    expect(() => processMeshSectionRequest(fractional)).toThrow();
  });

  it("lights quads from the payload light arrays", () => {
    const payload = cubePayload(); // a single cube at cell (0, 0, 0)
    payload.skyLight[0 + 1 * SECTION] = 12; // sky 12 at (0, 1, 0), the air above the cube
    payload.cells[1 + 1 * SECTION] = 1; // occluder at (1, 1, 0) in the up face's outward layer
    const result = processMeshSectionRequest(payload);

    const up = result.quads.find((q) => q.face === "up")!;
    // Corner (0,0) samples only (0,1,0) (all other corner cells out of section); corner (1,0)
    // averages (0,1,0)=12 with the opaque (1,1,0)=0; corner (1,1) averages four cells: 12/4 = 3.
    expect(up.vertexLights).toEqual([
      { sky: 12, block: 0 },
      { sky: 6, block: 0 },
      { sky: 6, block: 0 },
      { sky: 3, block: 0 },
    ]);
    // AO: the occluder at (1,1,0) is the side2 cell of corner (1,1) → 2; the front cells of the
    // other corners are never consulted, and out-of-section cells never occlude.
    expect(up.vertexAO).toEqual([3, 3, 3, 2]);
  });
});

describe("MeshWorkerClient", () => {
  it("dispatches a resolved result to the callback exactly once", () => {
    const client = new MeshWorkerClient();
    const calls: string[] = [];
    const jobId = client.requestSection(cubePayload(), (result) =>
      calls.push(result.sectionX + ":" + result.quads.length),
    );

    const payload = processMeshSectionRequest(cubePayload());
    const returned = client.handleMessage(
      MeshWorkerClient.resultMessage(jobId, payload),
    );

    expect(calls).toEqual(["0:6"]);
    expect(returned).toEqual(payload);
    expect(client.pendingCount).toBe(0);
  });

  it("rejects stale results (unknown, duplicate, cancelled) without callbacks", () => {
    const client = new MeshWorkerClient();
    let calls = 0;
    const jobId = client.requestSection(cubePayload(), () => calls++);
    const payload = processMeshSectionRequest(cubePayload());

    expect(
      client.handleMessage(MeshWorkerClient.resultMessage("ghost", payload)),
    ).toBeNull();
    expect(
      client.handleMessage(MeshWorkerClient.resultMessage(jobId, payload)),
    ).not.toBeNull();
    expect(
      client.handleMessage(MeshWorkerClient.resultMessage(jobId, payload)),
    ).toBeNull(); // duplicate
    expect(calls).toBe(1);

    const job2 = client.requestSection(cubePayload(), () => calls++);
    expect(client.cancel(job2)).toBe(true);
    expect(
      client.handleMessage(MeshWorkerClient.resultMessage(job2, payload)),
    ).toBeNull();
    expect(calls).toBe(1);
  });

  it("rejects invalid messages without mutation", () => {
    const client = new MeshWorkerClient();
    const jobId = client.requestSection(cubePayload(), () => undefined);

    expect(
      client.handleMessage({
        protocolVersion: 99,
        jobId,
        ok: true,
        payload: {},
      }),
    ).toBeNull();
    expect(
      client.handleMessage({ protocolVersion: 1, jobId, ok: true }),
    ).toBeNull(); // missing payload
    expect(client.handleMessage(null)).toBeNull();
    expect(client.pendingCount).toBe(1); // unchanged

    expect(
      client.handleMessage(
        MeshWorkerClient.resultMessage(
          jobId,
          processMeshSectionRequest(cubePayload()),
        ),
      ),
    ).not.toBeNull();
  });

  it("tracks pending lifecycle across resolve and cancel", () => {
    const client = new MeshWorkerClient();
    const a = client.requestSection(cubePayload(), () => undefined);
    const b = client.requestSection(cubePayload(), () => undefined);
    expect(client.pendingCount).toBe(2);

    client.handleMessage(
      MeshWorkerClient.resultMessage(
        a,
        processMeshSectionRequest(cubePayload()),
      ),
    );
    expect(client.pendingCount).toBe(1);
    expect(client.cancel(b)).toBe(true);
    expect(client.pendingCount).toBe(0);
  });
});

// ── Validation, packing and sampler coverage (verification campaign) ────────

import {
  validateMeshSectionResult,
  validateMeshSectionRequest,
  packQuadsToTypedArrays,
  PACKED_QUAD_STRIDE,
} from "../../src/rendering/WorkerMeshing";

describe("MeshSection result validation", () => {
  const goodQuad = {
    x: 1,
    y: 2,
    z: 3,
    width: 4,
    height: 5,
    blockId: 7,
    face: "up",
    vertexLights: [
      { sky: 15, block: 0 },
      { sky: 14, block: 1 },
      { sky: 13, block: 2 },
      { sky: 12, block: 3 },
    ],
    vertexAO: [0, 1, 2, 3],
  };

  function baseResult(
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      sectionX: 1,
      sectionY: -2,
      sectionZ: 3,
      quads: [goodQuad],
      ...extra,
    };
  }

  it("accepts a well-formed quad-form result", () => {
    expect(() => validateMeshSectionResult(baseResult())).not.toThrow();
  });

  it("rejects non-object envelopes and non-integer section coordinates", () => {
    expect(() => validateMeshSectionResult(null)).toThrow(/expected an object/);
    expect(() => validateMeshSectionResult(42)).toThrow(/expected an object/);
    for (const key of ["sectionX", "sectionY", "sectionZ"]) {
      const bad = baseResult({ [key]: 1.5 });
      expect(() => validateMeshSectionResult(bad)).toThrow(
        /section coordinates must be integers/,
      );
    }
  });

  it("validates the packed form strictly (Float32Array, quadCount, stride, length)", () => {
    const data = new Float32Array(PACKED_QUAD_STRIDE * 2);
    const ok = baseResult({
      data,
      quadCount: 2,
      stride: PACKED_QUAD_STRIDE,
      quads: [],
    });
    const parsed = validateMeshSectionResult(ok);
    expect(parsed.quads).toEqual([]);
    expect(parsed.packed?.quadCount).toBe(2);
    expect(parsed.packed?.stride).toBe(PACKED_QUAD_STRIDE);

    expect(() =>
      validateMeshSectionResult(baseResult({ data: [1, 2], quadCount: 1 })),
    ).toThrow(/packed data must be a Float32Array/);
    expect(() =>
      validateMeshSectionResult(
        baseResult({ data: new Float32Array(4), quadCount: -1 }),
      ),
    ).toThrow(/quadCount must be a non-negative integer/);
    expect(() =>
      validateMeshSectionResult(
        baseResult({ data: new Float32Array(4), quadCount: 0, stride: 3 }),
      ),
    ).toThrow(/stride must be 22/);
    expect(() =>
      validateMeshSectionResult(
        baseResult({
          data: new Float32Array(4),
          quadCount: 1,
          stride: PACKED_QUAD_STRIDE,
        }),
      ),
    ).toThrow(/length must equal quadCount \* stride/);
  });

  it("rejects malformed quads with field-naming errors", () => {
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: "nope" })),
    ).toThrow(/quads must be an array/);
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [null] })),
    ).toThrow(/each quad must be an object/);
    const badCoord = { ...goodQuad, x: Number.NaN };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badCoord] })),
    ).toThrow(/quad\.x/);
    const badWidth = { ...goodQuad, width: -1 };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badWidth] })),
    ).toThrow(/quad\.width/);
    const badFace = { ...goodQuad, face: "sideways" };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badFace] })),
    ).toThrow(/known model face/);
    const badLightCount = { ...goodQuad, vertexLights: [{ sky: 1, block: 2 }] };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badLightCount] })),
    ).toThrow(/vertexLights must hold 4 corners/);
    const badLight = {
      ...goodQuad,
      vertexLights: [
        { sky: 16, block: 0 },
        { sky: 0, block: 0 },
        { sky: 0, block: 0 },
        { sky: 0, block: 0 },
      ],
    };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badLight] })),
    ).toThrow(/integers in \[0, 15\]/);
    const badAO = { ...goodQuad, vertexAO: [0, 0, 0, 9] };
    expect(() =>
      validateMeshSectionResult(baseResult({ quads: [badAO] })),
    ).toThrow(/vertexAO must hold 4 integers in \[0, 3\]/);
  });
});

describe("MeshSection request validation", () => {
  function makeRequest(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      sectionX: 0,
      sectionY: 0,
      sectionZ: 0,
      cells: new Array(4096).fill(null),
      opaqueIds: [1],
      skyLight: new Array(4096).fill(15),
      blockLight: new Array(4096).fill(0),
      ...overrides,
    };
  }

  it("accepts a valid request", () => {
    expect(() => validateMeshSectionRequest(makeRequest())).not.toThrow();
  });

  it("rejects structural violations naming the field", () => {
    expect(() => validateMeshSectionRequest(undefined)).toThrow(
      /expected an object/,
    );
    expect(() =>
      validateMeshSectionRequest(makeRequest({ cells: [] })),
    ).toThrow(/cells must be 4096 entries/);
    expect(() =>
      validateMeshSectionRequest(
        makeRequest({ cells: new Array(4096).fill(-1) }),
      ),
    ).toThrow(/cells must be 4096 entries/);
    expect(() =>
      validateMeshSectionRequest(makeRequest({ opaqueIds: ["x"] })),
    ).toThrow(/opaqueIds must be an array of integers/);
    expect(() =>
      validateMeshSectionRequest(makeRequest({ skyLight: [] })),
    ).toThrow(/skyLight must be an array of 4096 entries/);
    expect(() =>
      validateMeshSectionRequest(
        makeRequest({ blockLight: new Array(4096).fill(99) }),
      ),
    ).toThrow(/blockLight values must be integers in \[0, 15\]/);
  });
});

describe("packQuadsToTypedArrays + sectionLightSampler", () => {
  it("round-trips every quad field into the documented stride layout", () => {
    const packed = packQuadsToTypedArrays([
      {
        x: 1,
        y: 2,
        z: 3,
        width: 4,
        height: 5,
        blockId: 42,
        face: "east",
        tintClass: 6,
        animationClass: 7,
        transparencyClass: 8,
        vertexLights: [
          { sky: 15, block: 1 },
          { sky: 14, block: 2 },
          { sky: 13, block: 3 },
          { sky: 12, block: 4 },
        ],
        vertexAO: [3, 2, 1, 0],
      },
    ]);
    expect(packed.stride).toBe(PACKED_QUAD_STRIDE);
    expect(packed.quadCount).toBe(1);
    expect(Array.from(packed.data.slice(0, 10))).toEqual([
      1, 2, 3, 4, 5, 42, 4, 6, 7, 8,
    ]); // face east = 4
    expect(Array.from(packed.data.slice(10, 22))).toEqual([
      15, 1, 3, 14, 2, 2, 13, 3, 1, 12, 4, 0,
    ]);
  });

  it("sampler reports opacity/bounds from the payload with section-local coordinates", () => {
    const cells: Array<number | null> = new Array(4096).fill(null);
    cells[0] = 1; // opaque at (0,0,0)
    cells[1] = 2; // non-opaque id
    const sampler = sectionLightSampler({
      sectionX: 5,
      sectionY: 1,
      sectionZ: -3,
      cells,
      opaqueIds: [1],
      skyLight: new Array(4096).fill(7),
      blockLight: new Array(4096).fill(9),
    });

    expect(sampler.inBounds(0, 0, 0)).toBe(true);
    expect(sampler.inBounds(-1, 0, 0)).toBe(false);
    expect(sampler.inBounds(16, 0, 0)).toBe(false);
    expect(sampler.isOpaque(0, 0, 0)).toBe(true); // id 1 opaque
    expect(sampler.isOpaque(1, 0, 0)).toBe(false); // id 2 not in opaqueIds
    expect(sampler.getSkyLight(3, 3, 3)).toBe(7);
    expect(sampler.getBlockLight(3, 3, 3)).toBe(9);
  });
});

// ── MeshWorkerClient pooled-mode coverage (verification campaign) ───────────

import type { WorkerPool } from "../../src/engine/WorkerPool";

/** Minimal controllable pool double capturing submitted jobs. */
class FakePool {
  readonly submitted: Array<{
    kind: string;
    generationToken: number;
    payload: unknown;
    onResult: (payload: unknown) => void;
    onFailure: () => void;
  }> = [];
  throwOnSubmit = false;
  cancelled: string[] = [];

  cancel(jobId: string): boolean {
    this.cancelled.push(jobId);
    return true;
  }

  submit(opts: {
    kind: string;
    generationToken: number;
    payload: unknown;
    onResult: (payload: unknown) => void;
    onFailure: () => void;
  }): string {
    if (this.throwOnSubmit) throw new RangeError("pending queue is full");
    this.submitted.push(opts);
    return `fake-${this.submitted.length}`;
  }

  asPool(): WorkerPool {
    return this as unknown as WorkerPool;
  }
}

function sectionPayload(): MeshSectionRequestPayload {
  return {
    sectionX: 1,
    sectionY: 0,
    sectionZ: -1,
    cells: new Array(4096).fill(null),
    opaqueIds: [1],
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

describe("MeshWorkerClient — pooled mode", () => {
  it("dispatches to the pool and resolves exactly once on a valid matching result", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool() });
    const payload = sectionPayload();
    let results: number = -1;
    client.requestSection(payload, (r) => {
      results = r.sectionX;
    });

    expect(pool.submitted.length).toBe(1);
    expect(pool.submitted[0]!.kind).toBe("mesh-section");

    pool.submitted[0]!.onResult({
      sectionX: payload.sectionX,
      sectionY: payload.sectionY,
      sectionZ: payload.sectionZ,
      quads: [],
    });
    expect(results).toBe(payload.sectionX);
    // A duplicate echo is inert.
    pool.submitted[0]!.onResult({
      sectionX: payload.sectionX,
      sectionY: payload.sectionY,
      sectionZ: payload.sectionZ,
      quads: [],
    });
    expect(results).toBe(payload.sectionX);
  });

  it("abandons on malformed or foreign payloads without callbacks or throws", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool() });
    let called = 0;
    client.requestSection(sectionPayload(), () => called++);

    pool.submitted[0]!.onResult({ broken: true }); // malformed
    pool.submitted[0]!.onResult({
      sectionX: 99,
      sectionY: 0,
      sectionZ: -1,
      quads: [],
    }); // foreign coords
    expect(called).toBe(0);
  });

  it("abandons on pool failure and rethrows synchronous pool rejection", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({ pool: pool.asPool() });
    let called = 0;
    client.requestSection(sectionPayload(), () => called++);
    pool.submitted[0]!.onFailure();
    expect(called).toBe(0);

    pool.throwOnSubmit = true;
    expect(() => client.requestSection(sectionPayload(), () => {})).toThrow(
      RangeError,
    );
  });

  it("cancelByToken drops superseded pending jobs so their results cannot resolve", () => {
    const pool = new FakePool();
    const client = new MeshWorkerClient({
      pool: pool.asPool(),
      generationToken: 4,
    });
    let called = 0;
    client.requestSection(sectionPayload(), () => called++);

    expect(client.cancelByToken(4)).toBe(1);
    expect(client.cancelByToken(4)).toBe(0); // already gone

    // The superseded worker result arrives late: no callback fires.
    pool.submitted[0]!.onResult({
      sectionX: 1,
      sectionY: 0,
      sectionZ: -1,
      quads: [],
    });
    expect(called).toBe(0);
  });
});
