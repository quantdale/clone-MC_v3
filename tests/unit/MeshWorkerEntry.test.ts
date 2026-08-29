import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { WORKER_PROTOCOL_VERSION } from '../../src/rendering/WorkerJobProtocol';
import { PACKED_QUAD_STRIDE, validateMeshSectionRequest } from '../../src/rendering/WorkerMeshing';
import type { MeshSectionRequestPayload } from '../../src/rendering/WorkerMeshing';

/**
 * Exercises the MeshWorkerEntry `mesh-section` handler directly through the protocol server's
 * captured `onmessage` — no real Worker is spawned. The entry registers its handler on import
 * against the injected fake scope.
 */
interface PostedMessage {
  message: Record<string, unknown>;
  transfer: Transferable[];
}
const posted: PostedMessage[] = [];
const fakeScope = {
  postMessage(message: unknown, transfer: Transferable[] = []): void {
    posted.push({ message: message as Record<string, unknown>, transfer });
  },
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

beforeAll(async () => {
  vi.stubGlobal('self', fakeScope);
  await import('../../src/rendering/MeshWorkerEntry');
});
beforeEach(() => {
  posted.length = 0;
});

function validPayload(): MeshSectionRequestPayload {
  const cells: Array<number | null> = new Array(4096).fill(null);
  cells[2184] = 1; // one solid interior block (8,8,8) → merged quads
  return {
    sectionX: 3,
    sectionY: 1,
    sectionZ: 2,
    versionSnapshot: {
      sections: [{ sectionX: 3, sectionY: 1, sectionZ: 2, meshVersion: 4, lightVersion: 5, target: true }],
    },
    cells,
    opaqueIds: [1],
    skyLight: new Array(4096).fill(15),
    blockLight: new Array(4096).fill(0),
  };
}

function send(payload: unknown, jobId = 'job-1'): void {
  expect(fakeScope.onmessage).toBeTypeOf('function');
  fakeScope.onmessage!({
    data: {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId,
      kind: 'mesh-section',
      generationToken: 7,
      payload,
    },
  });
}

describe('MeshWorkerEntry mesh-section handler', () => {
  it('valid request → packed PackedMeshResult payload + transferred data buffer', () => {
    send(validPayload());
    expect(posted.length).toBe(1);
    const msg = posted[0]!.message;
    expect(msg.ok).toBe(true);
    expect(msg.protocolVersion).toBe(WORKER_PROTOCOL_VERSION);
    expect(msg.jobId).toBe('job-1');
    expect(msg.generationToken).toBe(7);
    const payload = msg.payload as Record<string, unknown>;
    expect(payload.sectionX).toBe(3);
    expect(payload.sectionY).toBe(1);
    expect(payload.sectionZ).toBe(2);
    expect(payload.versionSnapshot).toEqual(validPayload().versionSnapshot);
    expect(payload.stride).toBe(PACKED_QUAD_STRIDE);
    expect(payload.quadCount).toBeGreaterThan(0);
    const data = payload.data as Float32Array;
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe((payload.quadCount as number) * PACKED_QUAD_STRIDE);
    // Transfer list moves exactly the packed data buffer.
    expect(posted[0]!.transfer.length).toBe(1);
    expect(posted[0]!.transfer[0]).toBe(data.buffer);
  });

  it('malformed payloads are rejected with an ok:false result', () => {
    const badCells = validPayload();
    badCells.cells = new Array(4095).fill(null); // wrong length
    const badLight = validPayload();
    (badLight.skyLight as number[])[10] = 16; // out of [0, 15]
    const badOpaque = validPayload();
    badOpaque.opaqueIds = ['x' as unknown as number];
    const badSections = { ...validPayload(), sectionX: 1.5 };
    for (const payload of [null, {}, badCells, badLight, badOpaque, badSections]) {
      send(payload);
      const last = posted[posted.length - 1]!;
      expect(last.message.ok).toBe(false);
      expect(typeof last.message.error).toBe('string');
      expect((last.message.error as string).length).toBeGreaterThan(0);
    }
    // Nothing succeeded along the way.
    expect(posted.every((p) => p.message.ok === false)).toBe(true);
  });

  it('request validator rejects non-integer / negative cells directly', () => {
    const payload = validPayload();
    payload.cells[100] = -1;
    expect(() => validateMeshSectionRequest(payload)).toThrow();
    payload.cells[100] = 1.5;
    expect(() => validateMeshSectionRequest(payload)).toThrow();
  });
});
