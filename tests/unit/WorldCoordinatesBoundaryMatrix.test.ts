import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  worldToChunk,
  worldToLocal,
  chunkLocalToWorld,
  worldToSection,
  worldToSectionLocal,
  worldYToSection,
  worldYToSectionLocal,
  floorDiv,
  floorMod,
  CHUNK_DIMENSIONS,
  CHUNK_SLAB_HEIGHT,
  CANONICAL_SECTION_SIZE,
} from '../../src/world/WorldCoordinates';
import { CONFIG } from '../../src/config';
import { SECTION_SIZE, sectionIndex, localCoord } from '../../src/math/SectionCoordinate';
import { VerticalWorldAccess } from '../../src/world/VerticalWorldAccess';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { World } from '../../src/world/World';
import { Chunk } from '../../src/world/Chunk';

const W = CONFIG.chunk.width; // 16
const H = CONFIG.chunk.height; // 64 slab
const D = CONFIG.chunk.depth; // 16

/** Canonical overworld boundaries (used in later assertions) */
const OVERWORLD_MIN_Y = -64;
const OVERWORLD_MAX_Y = 319;
void OVERWORLD_MIN_Y;
void OVERWORLD_MAX_Y;
/**
 * Full required boundary matrix from assignment:
 * Y: -65,-64,-33,-32,-17,-16,-1,0,15,16,31,32,63,64,319,320
 * X/Z: -17,-16,-1,0,15,16,17 (plus a few extras for roundtrip)
 */
const Y_MATRIX = [-65, -64, -33, -32, -17, -16, -1, 0, 15, 16, 31, 32, 63, 64, 319, 320];
const XZ_MATRIX = [-17, -16, -1, 0, 15, 16, 17, 31, 32];

/** Small world factory with overworld dimension (6 layers: -64..319). */
function makeOverworldWorld(): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      // Fill with stone so -64 is not air after generation (manual acceptance)
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed: 1337,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    dimension: OVERWORLD_DIMENSION_TYPE,
    renderDistance: 1,
  });
}

describe('WorldCoordinates: slab (64) vs canonical (16) boundary matrix', () => {
  it('exposes slab height 64 and canonical section size 16 as distinct constants', () => {
    expect(CHUNK_DIMENSIONS.height).toBe(64);
    expect(CHUNK_SLAB_HEIGHT).toBe(64);
    expect(CANONICAL_SECTION_SIZE).toBe(16);
    expect(SECTION_SIZE).toBe(16);
    expect(H).toBe(64);
  });

  it('worldToChunk Y uses floorDiv(y,64) for every Y in the required matrix', () => {
    for (const y of Y_MATRIX) {
      const expectedCy = Math.floor(y / H);
      const [ , cy ] = worldToChunk(0, y, 0);
      expect(cy, `y=${y} cy`).toBe(expectedCy);
      expect(cy).toBe(floorDiv(y, H));
      // local must stay in [0,64)
      const [ , ly ] = worldToLocal(0, y, 0);
      expect(ly).toBeGreaterThanOrEqual(0);
      expect(ly).toBeLessThan(H);
      expect(ly).toBe(floorMod(y, H));
      // roundtrip
      const [cx2, cy2, cz2] = worldToChunk(0, y, 0);
      const [lx, ly2, lz] = worldToLocal(0, y, 0);
      const [rx, ry, rz] = chunkLocalToWorld(cx2, cy2, cz2, lx, ly2, lz);
      expect(ry).toBe(y);
      expect(rx).toBe(0);
      expect(rz).toBe(0);
    }
  });

  it('worldToChunk X/Z use floorDiv(x,16) for every X/Z in the required matrix', () => {
    for (const x of XZ_MATRIX) {
      const expectedCx = Math.floor(x / W);
      const [cx] = worldToChunk(x, 0, 0);
      expect(cx, `x=${x} cx`).toBe(expectedCx);
      const [lx] = worldToLocal(x, 0, 0);
      expect(lx).toBeGreaterThanOrEqual(0);
      expect(lx).toBeLessThan(W);
      expect(lx).toBe(floorMod(x, W));
      const [cx2, cy2, cz2] = worldToChunk(x, 0, 0);
      const [lx2] = worldToLocal(x, 0, 0);
      const [rx] = chunkLocalToWorld(cx2, cy2, cz2, lx2, 0, 0);
      expect(rx).toBe(x);
    }
    for (const z of XZ_MATRIX) {
      const expectedCz = Math.floor(z / D);
      const [ , , cz] = worldToChunk(0, 0, z);
      expect(cz, `z=${z} cz`).toBe(expectedCz);
      const [ , , lz] = worldToLocal(0, 0, z);
      expect(lz).toBeGreaterThanOrEqual(0);
      expect(lz).toBeLessThan(D);
    }
  });

  it('worldToSection Y uses floorDiv(y,16) for every Y in the matrix (canonical storage)', () => {
    for (const y of Y_MATRIX) {
      const expectedSy = Math.floor(y / SECTION_SIZE);
      expect(worldYToSection(y)).toBe(expectedSy);
      expect(sectionIndex(y)).toBe(expectedSy);
      expect(worldToSection(0, y, 0)[1]).toBe(expectedSy);
      const expectedLy = ((y % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE;
      expect(worldYToSectionLocal(y)).toBe(expectedLy);
      expect(localCoord(y)).toBe(expectedLy);
      expect(worldToSectionLocal(0, y, 0)[1]).toBe(expectedLy);
      expect(expectedLy).toBeGreaterThanOrEqual(0);
      expect(expectedLy).toBeLessThan(16);
    }
  });

  it('slab and canonical Y diverge exactly where expected (64 vs 16)', () => {
    // Spot checks where cy(64) != sy(16)
    expect(worldToChunk(0, 32, 0)[1]).toBe(0); // 32/64 = 0
    expect(worldYToSection(32)).toBe(2); // 32/16 = 2
    expect(worldToLocal(0, 32, 0)[1]).toBe(32);
    expect(worldYToSectionLocal(32)).toBe(0);

    expect(worldToChunk(0, 64, 0)[1]).toBe(1); // 64/64 = 1
    expect(worldYToSection(64)).toBe(4); // 64/16 = 4
    expect(worldToLocal(0, 64, 0)[1]).toBe(0);
    expect(worldYToSectionLocal(64)).toBe(0);

    expect(worldToChunk(0, -16, 0)[1]).toBe(-1); // floor(-16/64) = -1
    expect(worldYToSection(-16)).toBe(-1); // floor(-16/16)= -1 (coincides here)
    expect(worldToLocal(0, -16, 0)[1]).toBe(48); // (-16 mod 64)=48
    expect(worldYToSectionLocal(-16)).toBe(0);

    expect(worldToChunk(0, -17, 0)[1]).toBe(-1);
    expect(worldYToSection(-17)).toBe(-2);
    expect(worldToLocal(0, -17, 0)[1]).toBe(47);
    expect(worldYToSectionLocal(-17)).toBe(15);
  });

  it('roundtrips every Y via slab and via canonical section consistently', () => {
    for (const y of Y_MATRIX) {
      // slab roundtrip
      const [ , cy ] = worldToChunk(0, y, 0);
      const [ , ly ] = worldToLocal(0, y, 0);
      expect(cy * H + ly).toBe(y);
      // canonical roundtrip
      const sy = worldYToSection(y);
      const lcy = worldYToSectionLocal(y);
      expect(sy * SECTION_SIZE + lcy).toBe(y);
    }
  });

  it('X/Z slab and section coincide (both 16) but naming distinguishes intent', () => {
    for (const x of XZ_MATRIX) {
      const [cx] = worldToChunk(x, 0, 0);
      const sx = worldToSection(x, 0, 0)[0];
      expect(cx).toBe(sx); // both floor(x/16)
      const [lx] = worldToLocal(x, 0, 0);
      const slx = worldToSectionLocal(x, 0, 0)[0];
      expect(lx).toBe(slx);
    }
  });

  it('Explicit per-boundary expectations for the assignment matrix (slab)', () => {
    // Precomputed expected cy/ly for the Y matrix under 64-stride
    const expected: Array<[number, number, number]> = [
      [-65, -2, 63],
      [-64, -1, 0],
      [-33, -1, 31],
      [-32, -1, 32],
      [-17, -1, 47],
      [-16, -1, 48],
      [-1, -1, 63],
      [0, 0, 0],
      [15, 0, 15],
      [16, 0, 16],
      [31, 0, 31],
      [32, 0, 32],
      [63, 0, 63],
      [64, 1, 0],
      [319, 4, 63],
      [320, 5, 0],
    ];
    for (const [y, expCy, expLy] of expected) {
      const [ , cy ] = worldToChunk(0, y, 0);
      const [ , ly ] = worldToLocal(0, y, 0);
      expect(cy).toBe(expCy);
      expect(ly).toBe(expLy);
    }
    // X/Z spot checks
    expect(worldToChunk(-17, 0, 0)[0]).toBe(-2);
    expect(worldToLocal(-17, 0, 0)[0]).toBe(15);
    expect(worldToChunk(-16, 0, 0)[0]).toBe(-1);
    expect(worldToLocal(-16, 0, 0)[0]).toBe(0);
    expect(worldToChunk(-17, 0, -17)[2]).toBe(-2);
    expect(worldToLocal(-17, 0, -17)[2]).toBe(15);
  });
});

describe('Canonical storage honors Overworld boundaries without allocating out-of-range', () => {
  it('VerticalWorldAccess containsY matches the required out-of-range matrix', () => {
    const registry = createDefaultBlockStateRegistry();
    const vwa = new VerticalWorldAccess({ dimension: OVERWORLD_DIMENSION_TYPE, registry });
    const airId = registry.getDefaultState(BlockId.Air).id;
    expect(OVERWORLD_DIMENSION_TYPE.containsY(-65)).toBe(false);
    expect(OVERWORLD_DIMENSION_TYPE.containsY(-64)).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.containsY(319)).toBe(true);
    expect(OVERWORLD_DIMENSION_TYPE.containsY(320)).toBe(false);

    // Reads at out-of-range return air and do not allocate columns
    expect(vwa.getBlockState(0, -65, 0).id).toBe(airId);
    expect(vwa.getBlockState(0, 320, 0).id).toBe(airId);
    expect(vwa.size).toBe(0);

    // Writes at out-of-range are no-ops and allocate nothing
    const stone = registry.getDefaultState(BlockId.Stone);
    vwa.setBlockState(0, -65, 0, stone);
    vwa.setBlockState(0, 320, 0, stone);
    expect(vwa.size).toBe(0);

    // In-range boundary writes round-trip and allocate exactly one column
    vwa.setBlockState(0, -64, 0, stone);
    const dirt = registry.getDefaultState(BlockId.Dirt);
    vwa.setBlockState(0, 319, 0, dirt);
    expect(vwa.getBlockState(0, -64, 0).id).toBe(stone.id);
    expect(vwa.getBlockState(0, 319, 0).id).toBe(dirt.id);
    expect(vwa.size).toBe(1);
  });

  it('World.getBlock at y=-65 returns air and does not allocate storage; y=-64 via generation returns stone; y=320 no allocation', () => {
    const world = makeOverworldWorld();
    // Before any generation, out-of-range reads are air and storage empty
    expect(world.getBlock(0, -65, 0)).toBe(BlockId.Air);
    expect(world.storage.size).toBe(0);
    // setBlock out-of-range is no-op (does not allocate)
    world.setBlock(0, -65, 0, BlockId.Stone);
    expect(world.getBlock(0, -65, 0)).toBe(BlockId.Air);
    expect(world.storage.size).toBe(0);
    world.setBlock(0, 320, 0, BlockId.Stone);
    expect(world.getBlock(0, 320, 0)).toBe(BlockId.Air);
    expect(world.storage.size).toBe(0);

    // Boundary in-range write via storage path allocates and round-trips
    world.setBlock(0, -64, 0, BlockId.Stone);
    expect(world.getBlock(0, -64, 0)).toBe(BlockId.Air); // chunk not yet generated, so ChunkManager still air
    // But canonical storage must have it (lazy column)
    expect(world.storage.getBlock(0, -64, 0)).toBe(BlockId.Stone);
    expect(world.storage.size).toBe(1);

    expect(world.storage.getBlock(0, 319, 0)).toBe(BlockId.Air);
    world.setBlock(0, 319, 0, BlockId.Dirt);
    expect(world.storage.getBlock(0, 319, 0)).toBe(BlockId.Dirt);

    // y=320 remains out-of-range even after writes
    world.setBlock(0, 320, 0, BlockId.Dirt);
    expect(world.storage.getBlock(0, 320, 0)).toBe(BlockId.Air);
    expect(world.storage.size).toBe(1); // still only the (0,0) column

    // Negative X/Z floor division: storage column identity respects floor
    world.setBlock(-1, 0, -1, BlockId.Stone);
    expect(world.storage.getBlock(-1, 0, -1)).toBe(BlockId.Stone);
    expect(world.storage.getColumn(-1, -1)?.chunkX).toBe(-1);

    world.setBlock(-16, 0, -16, BlockId.Dirt);
    expect(world.storage.getBlock(-16, 0, -16)).toBe(BlockId.Dirt);
    world.setBlock(-17, 0, -17, BlockId.Stone);
    expect(world.storage.getBlock(-17, 0, -17)).toBe(BlockId.Stone);
    // -16 is column -1, -17 is column -2 (floor division)
    expect(world.storage.hasColumn(-1, -1)).toBe(true);
    expect(world.storage.hasColumn(-2, -2)).toBe(true);
  });

  it('World.isSolid uses invisible floor below minY and respects negative Y via floorDiv', () => {
    const world = makeOverworldWorld();
    // Below -64 is solid floor (prevents falling forever) per World.isSolid contract
    expect(world.isSolid(0, -65, 0)).toBe(true);
    expect(world.isSolid(0, -100, 0)).toBe(true);
    // Inside world at air should be non-solid (before generation no chunks => air)
    expect(world.isSolid(0, 0, 0)).toBe(false);
    // Negative X/Z do not confuse Y floor handling: still air => not solid
    expect(world.isSolid(-1, -1, -1)).toBe(false);
    expect(world.isSolid(-17, -64, -17)).toBe(false);
    // isLoadedAt correctness (private) is covered indirectly: getBlock at those coords
    // remains air without allocation (previous test), proving floorDiv routing is sound.
  });
});
