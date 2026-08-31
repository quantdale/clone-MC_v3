/**
 * Unit tests for the typed world-startup compatibility assessment (257).
 * Covers the classification matrix: fresh current worlds, non-current baselines
 * with/without bounded canonical coverage, player-anchored coverage windows,
 * read uncertainty, and diagnostics determinism.
 */
import { describe, expect, it } from "vitest";
import {
  assessWorldStartup,
  isWithinStartupCoverage,
  WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS,
} from "../../src/storage/WorldStartupAssessment";

/** All canonical columns within the bounded coverage radius of the origin. */
function fullOriginCoverage(): Array<{ chunkX: number; chunkZ: number }> {
  const out: Array<{ chunkX: number; chunkZ: number }> = [];
  const r = WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS;
  for (let cx = -r; cx <= r; cx++) {
    for (let cz = -r; cz <= r; cz++) out.push({ chunkX: cx, chunkZ: cz });
  }
  return out;
}

describe("assessWorldStartup", () => {
  it("classifies a fresh world (no records) as current", () => {
    const a = assessWorldStartup({
      baseline: "current",
      readUncertain: false,
      canonicalColumns: [],
      playerStatePresent: false,
      playerChunk: null,
    });
    expect(a.mode).toBe("current");
    expect(a.reason).toBeNull();
  });

  it("classifies a current-baseline save as current regardless of column count", () => {
    const a = assessWorldStartup({
      baseline: "current",
      readUncertain: false,
      canonicalColumns: [{ chunkX: 10, chunkZ: -10 }],
      playerStatePresent: true,
      playerChunk: { chunkX: 10, chunkZ: -10 },
    });
    expect(a.mode).toBe("current");
    expect(a.reason).toBeNull();
  });

  it("never classifies read uncertainty on an existing world as current", () => {
    for (const baseline of ["current", "legacy-unknown", "unsupported"] as const) {
      const a = assessWorldStartup({
        baseline,
        readUncertain: true,
        canonicalColumns: [],
        playerStatePresent: false,
        playerChunk: null,
      });
      expect(a.mode).toBe("recovery-required");
      expect(a.reason).toBe("storage-read-uncertain");
      expect(a.diagnostics.readUncertain).toBe(true);
    }
  });

  it("classifies a legacy-unknown world with full spawn coverage as preserved", () => {
    const a = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: fullOriginCoverage(),
      playerStatePresent: false,
      playerChunk: null,
    });
    expect(a.mode).toBe("preserved");
    expect(a.reason).toBeNull();
    expect(a.diagnostics.missingCoverageColumns).toEqual([]);
  });

  it("classifies an unsupported future-baseline world with full coverage as preserved", () => {
    const a = assessWorldStartup({
      baseline: "unsupported",
      readUncertain: false,
      canonicalColumns: fullOriginCoverage(),
      playerStatePresent: false,
      playerChunk: null,
    });
    expect(a.mode).toBe("preserved");
    expect(a.reason).toBeNull();
  });

  it("classifies a legacy world with partial canonical coverage as recovery-required", () => {
    const columns = fullOriginCoverage().slice(0, 10); // drop required columns
    const a = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: columns,
      playerStatePresent: false,
      playerChunk: null,
    });
    expect(a.mode).toBe("recovery-required");
    expect(a.reason).toBe("missing-canonical-coverage");
    expect(a.diagnostics.missingCoverageColumns.length).toBeGreaterThan(0);
    expect(a.diagnostics.missingCoverageColumns.length).toBe(25 - 10);
  });

  it("anchors the coverage neighborhood at the persisted player chunk", () => {
    const anchor = { chunkX: 40, chunkZ: -40 };
    const columns = fullOriginCoverage().map((c) => ({
      chunkX: c.chunkX + anchor.chunkX,
      chunkZ: c.chunkZ + anchor.chunkZ,
    }));
    const a = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: columns,
      playerStatePresent: true,
      playerChunk: anchor,
    });
    expect(a.mode).toBe("preserved");
    expect(a.diagnostics.coverageAnchor).toEqual(anchor);
  });

  it("requires coverage around the player chunk even when the origin is covered", () => {
    const a = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: fullOriginCoverage(),
      playerStatePresent: true,
      playerChunk: { chunkX: 3, chunkZ: 0 },
    });
    expect(a.mode).toBe("recovery-required");
    expect(a.reason).toBe("missing-canonical-coverage");
  });

  it("reports deterministic, sorted diagnostics", () => {
    const a1 = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: [{ chunkX: 0, chunkZ: 0 }],
      playerStatePresent: true,
      playerChunk: { chunkX: 1, chunkZ: 1 },
    });
    const a2 = assessWorldStartup({
      baseline: "legacy-unknown",
      readUncertain: false,
      canonicalColumns: [{ chunkX: 0, chunkZ: 0 }],
      playerStatePresent: true,
      playerChunk: { chunkX: 1, chunkZ: 1 },
    });
    expect(a1).toEqual(a2);
    const xs = a1.diagnostics.missingCoverageColumns.map((c) => c.chunkX);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
  });

  it("exposes the bounded coverage helper consistently with the radius constant", () => {
    expect(isWithinStartupCoverage(0, 0, { chunkX: 0, chunkZ: 0 })).toBe(true);
    expect(isWithinStartupCoverage(WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS, 0, { chunkX: 0, chunkZ: 0 })).toBe(true);
    expect(isWithinStartupCoverage(WORLD_STARTUP_COVERAGE_RADIUS_CHUNKS + 1, 0, { chunkX: 0, chunkZ: 0 })).toBe(false);
  });
});
