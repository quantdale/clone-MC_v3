import { describe, it, expect } from 'vitest';
import {
  UNVERSIONED_TOKEN,
  WORKER_PROTOCOL_VERSION,
  WorkerJobClient,
  validateWorkerRequest,
  validateWorkerResult,
} from '../../src/rendering/WorkerJobProtocol';

function okResult(
  jobId: string,
  payload: unknown = {},
  opts: { kind?: 'worldgen' | 'mesh-section'; generationToken?: number } = {},
): Record<string, unknown> {
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId,
    kind: opts.kind ?? 'mesh-section',
    ok: true,
    generationToken: opts.generationToken ?? UNVERSIONED_TOKEN,
    payload,
  };
}

function failResult(jobId: string, error = 'boom', kind: 'worldgen' | 'mesh-section' = 'mesh-section'): Record<string, unknown> {
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    jobId,
    kind,
    ok: false,
    generationToken: UNVERSIONED_TOKEN,
    error,
  };
}

describe('validateWorkerRequest / validateWorkerResult', () => {
  it('validates well-formed envelopes and rejects malformed ones', () => {
    expect(
      validateWorkerRequest({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: 'j',
        kind: 'mesh-section',
        generationToken: 3,
        payload: 1,
      }),
    ).toEqual({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: 'j',
      kind: 'mesh-section',
      generationToken: 3,
      payload: 1,
    });
    expect(validateWorkerResult(okResult('j', { data: 1 }))).toEqual({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: 'j',
      kind: 'mesh-section',
      ok: true,
      generationToken: UNVERSIONED_TOKEN,
      payload: { data: 1 },
    });
    expect(validateWorkerResult(failResult('j'))).toEqual({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      jobId: 'j',
      kind: 'mesh-section',
      ok: false,
      generationToken: UNVERSIONED_TOKEN,
      error: 'boom',
    });

    // Unsupported protocol version.
    expect(() =>
      validateWorkerRequest({ protocolVersion: 99, jobId: 'j', kind: 'mesh-section', generationToken: 0, payload: 1 }),
    ).toThrow();
    // Unknown job kind (protocol v2 carries only worldgen / mesh-section).
    expect(() =>
      validateWorkerRequest({ protocolVersion: WORKER_PROTOCOL_VERSION, jobId: 'j', kind: 'm', generationToken: 0, payload: 1 }),
    ).toThrow();
    // Empty job id.
    expect(() =>
      validateWorkerRequest({ protocolVersion: WORKER_PROTOCOL_VERSION, jobId: '', kind: 'worldgen', generationToken: 0, payload: 1 }),
    ).toThrow();
    // Missing / non-finite generation token.
    expect(() =>
      validateWorkerRequest({ protocolVersion: WORKER_PROTOCOL_VERSION, jobId: 'j', kind: 'worldgen', payload: 1 }),
    ).toThrow();
    expect(() =>
      validateWorkerRequest({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: 'j',
        kind: 'worldgen',
        generationToken: Number.NaN,
        payload: 1,
      }),
    ).toThrow();
    // Missing error on failure / missing payload on success.
    expect(() => validateWorkerResult({ ...failResult('j'), error: undefined })).toThrow();
    expect(() => validateWorkerResult({ ...okResult('j'), payload: undefined })).toThrow();
    // transfer list must contain only ArrayBuffers.
    expect(() => validateWorkerResult({ ...okResult('j'), transfer: [42] })).toThrow();
  });
});

describe('WorkerJobClient', () => {
  it('submits jobs with unique ids and tracks pendingCount', () => {
    const client = new WorkerJobClient();
    const a = client.submit('mesh-section', 0);
    const b = client.submit('worldgen', 0);
    expect(a).not.toBe(b);
    expect(a.startsWith('job-')).toBe(true);
    expect(client.pendingCount).toBe(2);
  });

  it('resolves a pending job exactly once', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh-section', 7);

    const first = client.resolveResult(okResult(jobId, { quads: 5 }, { generationToken: 7 }));
    expect(first).toEqual({ jobId, kind: 'mesh-section', ok: true, generationToken: 7, payload: { quads: 5 } });
    expect(client.pendingCount).toBe(0);

    expect(client.resolveResult(okResult(jobId))).toBeNull(); // stale: already resolved
  });

  it('accepts the unversioned-token wildcard but rejects superseded tokens', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh-section', 7);

    // Wildcard (synchronous harness path) resolves regardless of the submission token...
    expect(client.resolveResult(okResult(jobId, {}, { generationToken: UNVERSIONED_TOKEN }))).not.toBeNull();

    // ...but an echoed concrete token that no longer matches is stale.
    const other = client.submit('worldgen', 4);
    expect(client.resolveResult(okResult(other, {}, { kind: 'worldgen', generationToken: 5 }))).toBeNull();
    expect(client.resolveResult(okResult(other, {}, { kind: 'worldgen', generationToken: 4 }))).not.toBeNull();
  });

  it('rejects results whose kind differs from the submission kind', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh-section', 0);
    expect(client.resolveResult(okResult(jobId, {}, { kind: 'worldgen' }))).toBeNull();
    expect(client.pendingCount).toBe(1); // mismatch leaves the job pending
  });

  it('rejects stale results for unknown and cancelled jobs', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh-section', 0);

    expect(client.resolveResult(okResult('ghost'))).toBeNull();
    expect(client.cancel(jobId)).toBe(true);
    expect(client.resolveResult(okResult(jobId))).toBeNull();
    expect(client.pendingCount).toBe(0);
  });

  it('cancelByToken cancels only jobs stamped with that token', () => {
    const client = new WorkerJobClient();
    client.submit('mesh-section', 11);
    client.submit('mesh-section', 12);
    client.submit('worldgen', 12);
    expect(client.cancelByToken(12)).toBe(2);
    expect(client.cancelByToken(11)).toBe(1);
    expect(client.cancelByToken(999)).toBe(0);
    expect(client.pendingCount).toBe(0);
  });

  it('rejects invalid messages without mutating pending state', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh-section', 0);

    expect(client.resolveResult({ protocolVersion: 99, jobId, kind: 'mesh-section', ok: true, generationToken: 0, payload: {} })).toBeNull();
    expect(client.resolveResult({ protocolVersion: WORKER_PROTOCOL_VERSION, jobId, kind: 'mesh-section', ok: false, generationToken: 0 })).toBeNull(); // missing error
    expect(client.resolveResult(null)).toBeNull();
    expect(client.resolveResult(undefined)).toBeNull();
    expect(client.pendingCount).toBe(1); // unchanged

    expect(client.resolveResult(okResult(jobId))).not.toBeNull();
  });

  it('carries payload on ok and error on failure', () => {
    const client = new WorkerJobClient();
    const okJob = client.submit('mesh-section', 0);
    const badJob = client.submit('worldgen', 0);

    expect(client.resolveResult(okResult(okJob, { n: 1 }))!.payload).toEqual({ n: 1 });
    expect(client.resolveResult(failResult(badJob, 'kaboom', 'worldgen'))).toEqual({
      jobId: badJob,
      kind: 'worldgen',
      ok: false,
      generationToken: UNVERSIONED_TOKEN,
      error: 'kaboom',
    });
    expect(client.pendingCount).toBe(0);
  });

  it('rejects submissions with unknown kinds or non-finite tokens', () => {
    const client = new WorkerJobClient();
    expect(() => client.submit('mesh' as 'mesh-section', 0)).toThrow();
    expect(() => client.submit('worldgen', Number.NaN)).toThrow();
    expect(client.pendingCount).toBe(0);
  });
});
