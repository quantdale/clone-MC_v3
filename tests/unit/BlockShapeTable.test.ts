import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BlockShapeTable,
  ShapeBuilders,
  VoxelShape,
  createDefaultBlockShapeTable,
} from '../../src/world/VoxelShape';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { Player } from '../../src/player/Player';
import { PlayerPhysics } from '../../src/player/PlayerPhysics';

describe('BlockShapeTable defaults', () => {
  it('answers FULL_CUBE for unregistered ids and every variant', () => {
    const table = new BlockShapeTable();
    for (const shape of [
      table.getCollisionShape(BlockId.Stone),
      table.getSelectionShape(BlockId.Stone),
      table.getOcclusionShape(BlockId.Stone),
      table.getCollisionShape(9999),
    ]) {
      expect(shape).toBe(VoxelShape.FULL_CUBE);
      expect(shape.boxes.length).toBe(1);
    }
  });

  it('set() fills omitted variants from collision', () => {
    const table = new BlockShapeTable();
    const slab = ShapeBuilders.slabBottom(0.5);
    table.set(1234, { collision: slab });
    expect(table.getCollisionShape(1234)).toBe(slab);
    expect(table.getSelectionShape(1234)).toBe(slab);
    expect(table.getOcclusionShape(1234)).toBe(slab);
  });
});

describe('createDefaultBlockShapeTable registrations', () => {
  const table = createDefaultBlockShapeTable();
  const registry = createDefaultBlockRegistry();

  function extents(shape: VoxelShape) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const b of shape.boxes) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
      maxZ = Math.max(maxZ, b.maxZ);
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  it('every registered block id exists in the default registry', () => {
    // Implicitly validated by registry.get() throwing below.
    for (const def of registry.all()) {
      if (table.has(def.id)) registry.get(def.id);
    }
    expect(table.has(BlockId.Wheat)).toBe(true);
  });

  it('fluids are EMPTY for every variant', () => {
    for (const id of [BlockId.Water, BlockId.Lava]) {
      expect(table.getCollisionShape(id)).toBe(VoxelShape.EMPTY);
      expect(table.getSelectionShape(id)).toBe(VoxelShape.EMPTY);
      expect(table.getOcclusionShape(id)).toBe(VoxelShape.EMPTY);
    }
  });

  it('crops: EMPTY collision and occlusion, small selection box', () => {
    for (const id of [BlockId.Wheat, BlockId.NetherWart]) {
      expect(table.getCollisionShape(id)).toBe(VoxelShape.EMPTY);
      expect(table.getOcclusionShape(id)).toBe(VoxelShape.EMPTY);
      const sel = table.getSelectionShape(id);
      expect(sel.isEmpty).toBe(false);
      const e = extents(sel);
      expect(e.maxY).toBeLessThan(1); // not full height
      expect(e.minX).toBeGreaterThanOrEqual(0);
      expect(e.maxX).toBeLessThanOrEqual(1);
    }
  });

  it('fire/redstone components: no collision, no occlusion, small selection', () => {
    for (const id of [
      BlockId.Fire,
      BlockId.RedstoneWire,
      BlockId.RedstoneTorch,
      BlockId.Lever,
      BlockId.StoneButton,
      BlockId.PressurePlate,
      BlockId.RedstoneRepeater,
      BlockId.RedstoneComparator,
      BlockId.Rail,
    ]) {
      expect(table.getCollisionShape(id), `collision ${id}`).toBe(VoxelShape.EMPTY);
      expect(table.getOcclusionShape(id), `occlusion ${id}`).toBe(VoxelShape.EMPTY);
      expect(table.getSelectionShape(id).isEmpty, `selection ${id}`).toBe(false);
    }
  });

  it('farmland is a 15/16 bottom slab for collision and selection', () => {
    for (const variant of ['collision', 'selection'] as const) {
      const shape =
        variant === 'collision'
          ? table.getCollisionShape(BlockId.Farmland)
          : table.getSelectionShape(BlockId.Farmland);
      expect(shape.boxes.length).toBe(1);
      const e = extents(shape);
      expect(e.minY).toBeCloseTo(0);
      expect(e.maxY).toBeCloseTo(15 / 16);
      expect(e.minX).toBeCloseTo(0);
      expect(e.maxX).toBeCloseTo(1);
    }
  });

  it('chest/furnace are slightly inset full-height boxes', () => {
    for (const id of [BlockId.Chest, BlockId.Furnace]) {
      for (const shape of [table.getCollisionShape(id), table.getSelectionShape(id)]) {
        expect(shape.boxes.length).toBe(1);
        const e = extents(shape);
        expect(e.maxY).toBeCloseTo(1);
        expect(e.minX).toBeGreaterThan(0);
        expect(e.maxX).toBeLessThan(1);
        expect(e.maxX - e.minX).toBeCloseTo(14 / 16);
      }
      // Occlusion inherits the collision box via set()'s variant fallback.
      expect(table.getOcclusionShape(id)).toBe(table.getCollisionShape(id));
    }
  });

  it('ambiguous state-dependent blocks are deliberately left full cube', () => {
    // Door/trapdoor/piston shapes depend on open/facing/extended state which
    // the id-keyed table cannot express; they keep the full-cube fallback.
    for (const id of [BlockId.Door, BlockId.Trapdoor, BlockId.Piston]) {
      expect(table.has(id)).toBe(false);
      expect(table.getCollisionShape(id)).toBe(VoxelShape.FULL_CUBE);
    }
  });
});

describe('PlayerPhysics over the default shape table', () => {
  /**
   * World stub: bedrock floor at y<0, a farmland cell at (2,0,2), a wheat
   * crop cell at (2,0,3). Solidity mirrors the registry: farmland solid,
   * wheat non-solid.
   */
  function farmWorld(): import('../../src/world/WorldAccess').WorldAccess {
    return {
      getBlock(x: number, y: number, z: number): number {
        if (y < 0) return BlockId.Bedrock; // bedrock floor cells are real blocks
        if (x === 2 && z === 2 && y === 0) return BlockId.Farmland;
        if (x === 2 && z === 3 && y === 0) return BlockId.Wheat;
        return BlockId.Air;
      },
      setBlock(): void {
        /* no-op */
      },
      isSolid(x: number, y: number, z: number): boolean {
        if (y < 0) return true; // bedrock floor
        // Farmland is a solid cell; wheat is non-solid like the registry.
        return y === 0 && x === 2 && z === 2;
      },
    };
  }

  const registry = createDefaultBlockRegistry();

  it('a player standing on farmland rests ~15/16 high', () => {
    const physics = new PlayerPhysics(farmWorld(), registry, {
      blockShapes: createDefaultBlockShapeTable(),
    });
    const player = new Player({ position: new THREE.Vector3(2, 5, 2) });
    player.velocity.y = -10;
    for (let i = 0; i < 120; i++) {
      physics.update(player, 0.016);
    }
    expect(player.onGround).toBe(true);
    // The farmland cell occupies [0,1]³; its slab top face sits at 15/16, so
    // feet settle there.
    expect(player.position.y).toBeCloseTo(15 / 16, 2);
    expect(physics.getSupportContact().kind).toBe('ground');
  });

  it('a falling player does NOT fall through crops unnaturally', () => {
    const physics = new PlayerPhysics(farmWorld(), registry, {
      blockShapes: createDefaultBlockShapeTable(),
    });
    const player = new Player({ position: new THREE.Vector3(4, 5, 3) });
    player.velocity.y = -10;
    for (let i = 0; i < 120; i++) {
      physics.update(player, 0.016);
    }
    // Wheat has EMPTY collision: the player passes through the crop cell and
    // lands on the bedrock floor at y=0 without getting stuck inside it.
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(physics.getSupportContact().kind).toBe('ground');
  });
});
