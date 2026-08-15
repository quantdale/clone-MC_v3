import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { EntityInstance } from '../../src/world/Entity';
import { createResourceId } from '../../src/data/ResourceId';
import { HostileMobRenderer } from '../../src/rendering/HostileMobRenderer';

const ZOMBIE_TYPE = createResourceId('minecraft', 'entity_type/zombie');
const OVERWORLD = createResourceId('minecraft', 'overworld');

function zombie(id: number, x = 0, y = 0, z = 0, yaw = 0): EntityInstance {
  return {
    id,
    typeId: ZOMBIE_TYPE,
    transform: { x, y, z, yaw, pitch: 0 },
    velocity: { vx: 0, vy: 0, vz: 0 },
    dimension: OVERWORLD,
    state: 'ACTIVE',
  };
}

describe('HostileMobRenderer', () => {
  it('adds one mesh per live zombie and positions it from the transform', () => {
    const scene = new THREE.Scene();
    const renderer = new HostileMobRenderer(scene);

    renderer.sync([zombie(1, 1, 2, 3), zombie(2, 4, 5, 6)]);

    expect(scene.children).toHaveLength(2);
    for (const child of scene.children) {
      expect(Number.isFinite(child.position.x)).toBe(true);
      expect(Number.isFinite(child.position.y)).toBe(true);
      expect(Number.isFinite(child.position.z)).toBe(true);
    }
  });

  it('updates, adds, and removes meshes to match a changed live set', () => {
    const scene = new THREE.Scene();
    const renderer = new HostileMobRenderer(scene);

    renderer.sync([zombie(1, 0, 0, 0), zombie(2, 0, 0, 0)]);
    expect(scene.children).toHaveLength(2);

    renderer.sync([zombie(2, 9, 9, 9), zombie(3, 1, 1, 1)]);

    expect(scene.children).toHaveLength(2);
    const positions = scene.children.map((c) => c.position.clone());
    expect(positions.some((p) => p.x === 9 && p.y === 9 && p.z === 9)).toBe(true);
    expect(positions.some((p) => p.x === 1 && p.y === 1 && p.z === 1)).toBe(true);
  });

  it('dispose removes every mesh from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new HostileMobRenderer(scene);

    renderer.sync([zombie(1), zombie(2)]);
    expect(scene.children).toHaveLength(2);

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
