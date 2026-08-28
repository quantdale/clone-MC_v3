import { describe, it, expect } from "vitest";
import {
  MeshStreamBuilder,
  MeshBuildResultBuilder,
  MESH_STREAM_NAMES,
  emptyMeshStream,
  emitQuad,
  type UvRect,
} from "../../src/world/MeshingTypes";

/** Push four vertices at distinct positions and return the first index. */
function pushFour(builder: MeshStreamBuilder): number {
  let first = -1;
  for (let i = 0; i < 4; i++) {
    const index = builder.pushVertex(i, 0, 0, 0, 1, 0, 0, 0, 15, 0, 3, 1, 1, 1);
    if (i === 0) first = index;
  }
  return first;
}

describe("MeshStreamBuilder — vertex/index conventions", () => {
  it("pushVertex returns sequential vertex indices", () => {
    const builder = new MeshStreamBuilder();
    expect(builder.pushVertex(0, 0, 0, 0, 1, 0, 0, 0, 15, 0, 3, 1, 1, 1)).toBe(
      0,
    );
    expect(builder.pushVertex(1, 0, 0, 0, 1, 0, 0, 0, 15, 0, 3, 1, 1, 1)).toBe(
      1,
    );
    expect(builder.vertexCount).toBe(2);
  });

  it("pushQuadIndices emits CCW (0,1,2)/(0,2,3) triangles by default", () => {
    const builder = new MeshStreamBuilder();
    pushFour(builder);
    builder.pushQuadIndices();

    const stream = builder.toStream();
    expect([...stream.indices]).toEqual([0, 1, 2, 0, 2, 3]);
    expect(stream.indexCount).toBe(6);
    expect(builder.quadCount).toBe(1);
  });

  it("pushQuadIndices(lastIndex) bases quads on the passed quad base", () => {
    const builder = new MeshStreamBuilder();
    for (let q = 0; q < 2; q++) {
      pushFour(builder);
      builder.pushQuadIndices();
    }
    // Explicit: vertices 8..11 pushed after two default quads.
    const before = builder.quadCount;
    pushFour(builder);
    builder.pushQuadIndices(builder.vertexCount - 1);
    const stream = builder.toStream();
    expect([...stream.indices].slice(12, 18)).toEqual([8, 9, 10, 8, 10, 11]);
    expect(builder.quadCount).toBe(before + 1);
  });

  it("toStream() attribute lengths match vertexCount", () => {
    const builder = new MeshStreamBuilder();
    pushFour(builder);
    builder.pushQuadIndices();
    const stream = builder.toStream();
    expect(stream.vertexCount).toBe(4);
    expect(stream.positions.length).toBe(12);
    expect(stream.normals.length).toBe(12);
    expect(stream.uvs.length).toBe(8);
    expect(stream.skyLight.length).toBe(4);
    expect(stream.blockLight.length).toBe(4);
    expect(stream.ao.length).toBe(4);
    expect(stream.tint.length).toBe(12);
  });
});

describe("MeshStreamBuilder — grow-only scratch reuse", () => {
  it("reset() clears counters but retains buffer capacity across builds", () => {
    const builder = new MeshStreamBuilder();
    // Force a grow well past the initial capacity.
    for (let i = 0; i < 2000; i++) {
      builder.pushVertex(i, 0, 0, 0, 1, 0, 0, 0, 15, 0, 3, 1, 1, 1);
    }
    const bigPositions = builder.toStream().positions;
    expect(bigPositions.length).toBe(2000 * 3);

    builder.reset();
    expect(builder.vertexCount).toBe(0);
    expect(builder.quadCount).toBe(0);
    // Empty builds share the frozen empty buffers (no reallocation).
    expect(builder.toStream().positions.byteLength).toBe(0);
    expect(builder.toStream().positions).toBe(emptyMeshStream().positions);

    // The next build reuses the grown capacity: no shrink to initial size.
    pushFour(builder);
    const stream = builder.toStream();
    expect(stream.positions.length).toBe(12);
    expect(stream.positions.byteLength <= bigPositions.byteLength).toBe(true);
  });

  it("toStream() on an empty builder returns the shared frozen empty stream", () => {
    const builder = new MeshStreamBuilder();
    const empty = emptyMeshStream();
    const a = builder.toStream();
    const b = new MeshStreamBuilder().toStream();
    expect(a.positions).toBe(empty.positions);
    expect(b.positions).toBe(empty.positions);
    expect(a.indices).toBe(empty.indices);
    expect(a.vertexCount).toBe(0);
    expect(b.indexCount).toBe(0);
  });
});

describe("MeshBuildResultBuilder", () => {
  it("build() stamps inputVersion and zero metadata when nothing was emitted", () => {
    const result = new MeshBuildResultBuilder().build(42);
    expect(result.inputVersion).toBe(42);
    for (const name of MESH_STREAM_NAMES) {
      expect(result.streams[name].vertexCount).toBe(0);
      expect(result.streams[name].indices).toBe(emptyMeshStream().indices);
      expect(result.metadata[name]).toEqual({
        vertexCount: 0,
        indexCount: 0,
        quadCount: 0,
      });
    }
  });

  it("build() reports per-stream counts only for populated streams", () => {
    const assembler = new MeshBuildResultBuilder();
    pushFour(assembler.builder("opaque"));
    assembler.builder("opaque").pushQuadIndices();
    pushFour(assembler.builder("fluid"));
    assembler.builder("fluid").pushQuadIndices();

    const result = assembler.build(7);
    expect(result.inputVersion).toBe(7);
    expect(result.metadata.opaque).toEqual({
      vertexCount: 4,
      indexCount: 6,
      quadCount: 1,
    });
    expect(result.metadata.fluid).toEqual({
      vertexCount: 4,
      indexCount: 6,
      quadCount: 1,
    });
    expect(result.metadata.cutout).toEqual({
      vertexCount: 0,
      indexCount: 0,
      quadCount: 0,
    });
    expect(result.metadata.translucent).toEqual({
      vertexCount: 0,
      indexCount: 0,
      quadCount: 0,
    });
    expect(result.streams.opaque.vertexCount).toBe(4);
    expect(result.streams.cutout.vertexCount).toBe(0);

    // reset() clears every stream without discarding the assembler.
    assembler.reset();
    expect(assembler.build(8).metadata.opaque.quadCount).toBe(0);
  });
});

describe("emitQuad — corner UV convention", () => {
  const uv: UvRect = { u0: 0.25, v0: 0.5, u1: 0.75, v1: 1 };

  function collectUvs(
    lights?: readonly { sky: number; block: number }[],
  ): number[] {
    const builder = new MeshStreamBuilder();
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ];
    emitQuad(
      builder,
      corners,
      0,
      1,
      0,
      uv,
      lights ?? [
        { sky: 15, block: 0 },
        { sky: 15, block: 0 },
        { sky: 15, block: 0 },
        { sky: 15, block: 0 },
      ],
      [3, 3, 3, 3],
      1,
      1,
      1,
    );
    return [...builder.toStream().uvs];
  }

  it("maps c0→(u0,v0), c1→(u1,v0), c2→(u1,v1), c3→(u0,v1)", () => {
    expect(collectUvs()).toEqual([
      uv.u0,
      uv.v0,
      uv.u1,
      uv.v0,
      uv.u1,
      uv.v1,
      uv.u0,
      uv.v1,
    ]);
  });

  it("forwards per-corner light and AO levels in the same corner order and closes the quad indices", () => {
    const builder = new MeshStreamBuilder();
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ];
    emitQuad(
      builder,
      corners,
      0,
      1,
      0,
      uv,
      [
        { sky: 15, block: 0 },
        { sky: 14, block: 1 },
        { sky: 13, block: 2 },
        { sky: 12, block: 3 },
      ],
      [3, 2, 1, 0],
      1,
      1,
      1,
    );
    const stream = builder.toStream();
    expect([...stream.skyLight]).toEqual([15, 14, 13, 12]);
    expect([...stream.blockLight]).toEqual([0, 1, 2, 3]);
    expect([...stream.ao]).toEqual([3, 2, 1, 0]);
    expect([...stream.positions]).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]);
    expect([...stream.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });
});
