import { describe, it, expect } from 'vitest';
import {
  WORKER_PROTOCOL_VERSION,
  WorkerJobClient,
  validateWorkerRequest,
  validateWorkerResult,
} from '../../src/rendering/WorkerJobProtocol';

function okResult(jobId: string, payload: unknown = {}): unknown {
  return { protocolVersion: WORKER_PROTOCOL_VERSION, jobId, ok: true, payload };
}

function failResult(jobId: string, error = 'boom'): unknown {
  return { protocolVersion: WORKER_PROTOCOL_VERSION, jobId, ok: false, error };
}

describe('validateWorkerRequest / validateWorkerResult', () => {
  it('validates well-formed envelopes and rejects malformed ones', () => {
    expect(validateWorkerRequest({ protocolVersion: 1, jobId: 'j', kind: 'mesh', payload: 1 })).toEqual({
      protocolVersion: 1,
      jobId: 'j',
      kind: 'mesh',
      payload: 1,
    });
    expect(validateWorkerResult(okResult('j', { data: 1 }))).toEqual({
      protocolVersion: 1,
      jobId: 'j',
      ok: true,
      payload: { data: 1 },
    });
    expect(validateWorkerResult(failResult('j'))).toEqual({
      protocolVersion: 1,
      jobId: 'j',
      ok: false,
      error: 'boom',
    });

    expect(() => validateWorkerRequest({ protocolVersion: 2, jobId: 'j', kind: 'm', payload: 1 })).toThrow();
    expect(() => validateWorkerRequest({ protocolVersion: 1, jobId: '', kind: 'm', payload: 1 })).toThrow();
    expect(() => validateWorkerResult({ protocolVersion: 1, jobId: 'j', ok: false })).toThrow();
    expect(() => validateWorkerResult({ protocolVersion: 1, jobId: 'j', ok: true })).toThrow();
  });
});

describe('WorkerJobClient', () => {
  it('submits jobs with unique ids and tracks pendingCount', () => {
    const client = new WorkerJobClient();
    const a = client.submit('mesh', {});
    const b = client.submit('gen', {});
    expect(a).not.toBe(b);
    expect(a.startsWith('job-')).toBe(true);
    expect(client.pendingCount).toBe(2);
  });

  it('resolves a pending job exactly once', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh', {});

    const first = client.resolveResult(okResult(jobId, { quads: 5 }));
    expect(first).toEqual({ jobId, ok: true, payload: { quads: 5 } });
    expect(client.pendingCount).toBe(0);

    expect(client.resolveResult(okResult(jobId))).toBeNull(); // stale: already resolved
  });

  it('rejects stale results for unknown and cancelled jobs', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh', {});

    expect(client.resolveResult(okResult('ghost'))).toBeNull();
    expect(client.cancel(jobId)).toBe(true);
    expect(client.resolveResult(okResult(jobId))).toBeNull();
    expect(client.pendingCount).toBe(0);
  });

  it('rejects invalid messages without mutating pending state', () => {
    const client = new WorkerJobClient();
    const jobId = client.submit('mesh', {});

    expect(client.resolveResult({ protocolVersion: 99, jobId, ok: true, payload: {} })).toBeNull();
    expect(client.resolveResult({ protocolVersion: 1, jobId, ok: false })).toBeNull(); // missing error
    expect(client.resolveResult(null)).toBeNull();
    expect(client.pendingCount).toBe(1); // unchanged

    expect(client.resolveResult(okResult(jobId))).not.toBeNull();
  });

  it('carries payload on ok and error on failure', () => {
    const client = new WorkerJobClient();
    const okJob = client.submit('a', {});
    const badJob = client.submit('b', {});

    expect(client.resolveResult(okResult(okJob, { n: 1 }))!.payload).toEqual({ n: 1 });
    expect(client.resolveResult(failResult(badJob, 'kaboom'))).toEqual({
      jobId: badJob,
      ok: false,
      error: 'kaboom',
    });
    expect(client.pendingCount).toBe(0);
  });
});
