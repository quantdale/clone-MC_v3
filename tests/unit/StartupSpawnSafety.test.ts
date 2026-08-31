/**
 * Unit tests for startup player-position safety (257): bounded support/collision
 * validation and nearby relocation for candidate startup positions.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateStartupPosition,
  findSafeStartupPositionNear,
  STARTUP_MAX_SUPPORT_DROP,
  type StartupSolidity,
  type StartupWorldView,
} from "../../src/engine/StartupSpawnSafety";
import { OVERWORLD_DIMENSION_TYPE } from "../../src/data/DimensionTypes";

const AIR = 0;
const STONE = 3;

/** Block storage keyed by `x,y,z`; unlisted cells are air. */
function makeWorld(blocks: Map<string, number>, surfaces: Map<string, number>, hasColumns: Set<string>): {
  world: StartupWorldView;
  solidity: StartupSolidity;
} {
  const world: StartupWorldView = {
    getBlock: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? AIR,
    getMotionBlockingHeight: (x, z) => surfaces.get(`${x},${z}`) ?? -65,
    hasCanonicalColumn: (x, z) => hasColumns.has(`${x},${z}`),
    dimension: OVERWORLD_DIMENSION_TYPE,
  };
  const solidity: StartupSolidity = { isSolid: (id) => id !== AIR };
  return { world, solidity };
}

describe("evaluateStartupPosition", () => {
  it("accepts a position exactly on a proven surface", () => {
    const surfaces = new Map([["0,0", 63]]);
    const columns = new Set(["0,0"]);
    const blocks = new Map<string, number>([
      ["0,63,0", STONE],
      ["0,64,0", AIR],
      ["0,65,0", AIR],
    ]);
    const { world, solidity } = makeWorld(blocks, surfaces, columns);
    expect(evaluateStartupPosition(world, solidity, 0.5, 64, 0.5)).toBe("supported");
  });

  it("accepts a small drop to a proven surface within the bounded epsilon", () => {
    const surfaces = new Map([["0,0", 63]]);
    const columns = new Set(["0,0"]);
    const blocks = new Map<string, number>([
      ["0,63,0", STONE],
      ["0,64,0", AIR],
      ["0,65,0", AIR],
      ["0,66,0", AIR],
      ["0,67,0", AIR],
    ]);
    const { world, solidity } = makeWorld(blocks, surfaces, columns);
    const y = 64 + STARTUP_MAX_SUPPORT_DROP;
    expect(evaluateStartupPosition(world, solidity, 0.5, y, 0.5)).toBe("supported");
    expect(evaluateStartupPosition(world, solidity, 0.5, y + 1.01, 0.5)).toBe("no-support");
  });

  it("rejects a structurally valid position over an absent column (no proven terrain)", () => {
    // Legacy world: absent column -> baseline-aware height is minY-1 (no surface).
    const { world, solidity } = makeWorld(new Map(), new Map(), new Set());
    expect(evaluateStartupPosition(world, solidity, 8.5, 64, 8.5)).toBe("no-support");
  });

  it("rejects a position whose body volume intersects solid blocks", () => {
    const surfaces = new Map([["0,0", 63]]);
    const columns = new Set(["0,0"]);
    const blocks = new Map<string, number>([
      ["0,63,0", STONE],
      ["0,64,0", STONE], // feet-level block: inside the body volume
    ]);
    const { world, solidity } = makeWorld(blocks, surfaces, columns);
    expect(evaluateStartupPosition(world, solidity, 0.5, 64, 0.5)).toBe("body-collision");
  });

  it("rejects out-of-dimension and non-finite candidates", () => {
    const { world, solidity } = makeWorld(new Map(), new Map([["0,0", 63]]), new Set(["0,0"]));
    expect(evaluateStartupPosition(world, solidity, 0.5, 400, 0.5)).toBe("out-of-dimension");
    expect(evaluateStartupPosition(world, solidity, 0.5, -100, 0.5)).toBe("out-of-dimension");
    expect(evaluateStartupPosition(world, solidity, Number.NaN, 64, 0.5)).toBe("out-of-dimension");
    expect(evaluateStartupPosition(world, solidity, Number.POSITIVE_INFINITY, 64, 0.5)).toBe(
      "out-of-dimension",
    );
  });

  it("skips the body probe when the column is absent in a current-baseline world", () => {
    // Prediction-only column: support comes from the (authoritative) predicted surface.
    const surfaces = new Map([["0,0", 63]]);
    const { world, solidity } = makeWorld(new Map(), surfaces, new Set());
    expect(evaluateStartupPosition(world, solidity, 0.5, 64, 0.5)).toBe("supported");
  });
});

describe("findSafeStartupPositionNear", () => {
  it("relocates to a proven supported column near the void origin", () => {
    const surfaces = new Map([
      ["0,0", -65], // void at the origin
      ["7,11", 63],
    ]);
    const columns = new Set(["0,0", "1,1"]);
    const blocks = new Map<string, number>([["8,63,8", STONE]]);
    const { world, solidity } = makeWorld(blocks, surfaces, columns);
    const safe = findSafeStartupPositionNear(world, solidity, 0, 0, 4);
    expect(safe).not.toBeNull();
    expect(safe!.x).toBe(7.5);
    expect(safe!.y).toBe(64);
    expect(safe!.z).toBe(11.5);
  });

  it("returns null when no bounded candidate is supported (escalates to recovery)", () => {
    const { world, solidity } = makeWorld(new Map(), new Map(), new Set());
    expect(findSafeStartupPositionNear(world, solidity, 0, 0, 8)).toBeNull();
  });

  it("is deterministic for identical inputs", () => {
    const surfaces = new Map([
      ["7,11", 63],
      ["14,22", 70],
    ]);
    const { world, solidity } = makeWorld(new Map(), surfaces, new Set(["1,1", "2,2"]));
    const a = findSafeStartupPositionNear(world, solidity, 0, 0, 16);
    const b = findSafeStartupPositionNear(world, solidity, 0, 0, 16);
    expect(a).toEqual(b);
  });
});
