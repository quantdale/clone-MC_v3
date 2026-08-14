import { describe, it, expect } from 'vitest';
import {
  processWorldgenRequest,
  validateWorldgenRequest,
  validateWorldgenResult,
  WorldgenWorkerClient,
  WORLDGEN_PROTOCOL_VERSION,
  type WorldgenRequestPayload,
} from '../../src/worldgen/WorkerWorldgen';

const REQUEST: WorldgenRequestPayload = { columnX: 3, columnZ: -5, seed: 42, stage: 'TERRAIN' };

describe('validateWorldgenRequest', () => {
  it('accepts a valid request', () => {
    expect(validateWorldgenRequest(REQUEST)).toEqual(REQUEST);
  });

  it('rejects malformed requests naming the field', () => {
    expect(() => validateWorldgenRequest({ ...REQUEST, columnX: 1.5 })).toThrow(/columnX/i);
    expect(() => validateWorldgenRequest({ ...REQUEST, columnZ: NaN })).toThrow(/columnZ/i);
    expect(() => validateWorldgenRequest({ ...REQUEST, seed: '42' })).toThrow(/seed/i);
    expect(() => validateWorldgenRequest({ ...REQUEST, stage: 'MOON' })).toThrow(/stage/i);
    expect(() => validateWorldgenRequest(null)).toThrow(/object/i);
  });
});

describe('processWorldgenRequest', () => {
  it('returns the versioned identity-echoing envelope', () => {
    expect(processWorldgenRequest(REQUEST)).toEqual({
      columnX: 3,
      columnZ: -5,
      seed: 42,
      stage: 'TERRAIN',
      generationVersion: WORLDGEN_PROTOCOL_VERSION,
    });
  });

  it('is pure and deterministic', () => {
    expect(processWorldgenRequest(REQUEST)).toEqual(processWorldgenRequest(REQUEST));
  });
});

describe('validateWorldgenResult', () => {
  it('accepts a valid versioned result', () => {
    expect(validateWorldgenResult(processWorldgenRequest(REQUEST))).toEqual(processWorldgenRequest(REQUEST));
  });

  it('rejects wrong versions and malformed shapes', () => {
    const result = processWorldgenRequest(REQUEST);
    expect(() => validateWorldgenResult({ ...result, generationVersion: 99 })).toThrow(/generationVersion/i);
    expect(() => validateWorldgenResult({ ...result, columnX: 1.5 })).toThrow(/columnX/i);
    expect(() => validateWorldgenResult({ ...result, stage: 'MOON' })).toThrow(/stage/i);
    expect(() => validateWorldgenResult(null)).toThrow(/object/i);
  });
});

describe('WorldgenWorkerClient', () => {
  it('dispatches a valid matching result exactly once', () => {
    const client = new WorldgenWorkerClient();
    const calls: Array<[string, number]> = [];
    const jobId = client.submit(REQUEST, (result) => calls.push([result.stage, result.generationVersion]));

    const payload = processWorldgenRequest(REQUEST);
    const returned = client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, payload));

    expect(calls).toEqual([['TERRAIN', 1]]);
    expect(returned).toEqual(payload);
    expect(client.pendingCount).toBe(0);
  });

  it('drops identity-mismatched results without callbacks (job consumed; re-submit)', () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const jobId = client.submit(REQUEST, () => calls++);

    const wrongColumn = processWorldgenRequest({ ...REQUEST, columnX: 9 });
    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, wrongColumn))).toBeNull();
    expect(calls).toBe(0);
    expect(client.pendingCount).toBe(0); // the result consumed the job; the caller re-submits

    const retry = client.submit(REQUEST, () => calls++);
    const good = processWorldgenRequest(REQUEST);
    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(retry, good))).not.toBeNull();
    expect(calls).toBe(1);
  });

  it('rejects stale, duplicate, and cancelled results without callbacks', () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const jobId = client.submit(REQUEST, () => calls++);
    const payload = processWorldgenRequest(REQUEST);

    expect(client.handleMessage(WorldgenWorkerClient.resultMessage('ghost', payload))).toBeNull();
    expect(client.handleMessage({ protocolVersion: 99, jobId, ok: true, payload })).toBeNull(); // bad protocol
    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, payload))).not.toBeNull();
    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(jobId, payload))).toBeNull(); // duplicate
    expect(calls).toBe(1);

    const job2 = client.submit(REQUEST, () => calls++);
    expect(client.cancel(job2)).toBe(true);
    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(job2, payload))).toBeNull();
    expect(calls).toBe(1);
    expect(client.pendingCount).toBe(0);
  });

  it('tracks pending lifecycle across resolve and cancel', () => {
    const client = new WorldgenWorkerClient();
    const a = client.submit(REQUEST, () => undefined);
    const b = client.submit(REQUEST, () => undefined);
    expect(client.pendingCount).toBe(2);

    client.handleMessage(WorldgenWorkerClient.resultMessage(a, processWorldgenRequest(REQUEST)));
    expect(client.pendingCount).toBe(1);
    expect(client.cancel(b)).toBe(true);
    expect(client.pendingCount).toBe(0);
  });
});
