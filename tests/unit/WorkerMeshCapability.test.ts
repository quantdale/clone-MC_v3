import { describe, it, expect } from "vitest";
import {
  recommendedWorkerPoolSize,
  resolveWorkerMeshingSupport,
} from "../../src/rendering/WorkerMeshCapability";

describe("recommendedWorkerPoolSize", () => {
  it("leaves main/browser capacity: half the cores, clamped to [1, 4]", () => {
    expect(recommendedWorkerPoolSize(0)).toBe(1); // unknown cores: minimum
    expect(recommendedWorkerPoolSize(1)).toBe(1);
    expect(recommendedWorkerPoolSize(2)).toBe(1);
    expect(recommendedWorkerPoolSize(4)).toBe(2);
    expect(recommendedWorkerPoolSize(8)).toBe(4);
    expect(recommendedWorkerPoolSize(16)).toBe(4); // hard cap
    expect(recommendedWorkerPoolSize(64)).toBe(4);
  });

  it("rejects invalid core counts", () => {
    expect(() => recommendedWorkerPoolSize(-1)).toThrow(/hardwareConcurrency/);
    expect(() => recommendedWorkerPoolSize(Number.NaN)).toThrow(/hardwareConcurrency/);
  });
});

describe("resolveWorkerMeshingSupport", () => {
  it("supports worker meshing with a conservative pool when Worker exists", () => {
    expect(resolveWorkerMeshingSupport({ workerAvailable: true, hardwareConcurrency: 8 })).toEqual({
      supported: true,
      poolSize: 4,
      reason: "worker meshing supportable with pool size 4",
    });
  });

  it("requires the sync fallback when Worker is unavailable", () => {
    expect(resolveWorkerMeshingSupport({ workerAvailable: false, hardwareConcurrency: 8 })).toEqual({
      supported: false,
      poolSize: 1,
      reason: "Worker unavailable: deterministic sync fallback required",
    });
  });

  it("fails closed on malformed capability reports", () => {
    for (const bad of [
      null,
      {},
      { workerAvailable: true, hardwareConcurrency: -2 },
      { workerAvailable: "yes", hardwareConcurrency: 8 },
    ]) {
      const decision = resolveWorkerMeshingSupport(bad);
      expect(decision.supported).toBe(false);
      expect(decision.poolSize).toBe(1);
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });
});
