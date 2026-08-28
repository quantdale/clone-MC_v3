import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { WorldLife } from '../../src/world/WorldLife';

describe('world life', () => {
  it('creates deterministic passive critters and disposes their scene objects', () => {
    const scene = new THREE.Scene();
    const generator = new TerrainGenerator(createDefaultBlockRegistry(), 1234);
    const life = new WorldLife(scene, generator, 1234, 4);
    expect(scene.children).toHaveLength(4);
    const before = scene.children.map((child) => child.position.clone());
    life.update(0.5, new THREE.Vector3(0, 0, 0));
    for (const child of scene.children) {
      expect(Number.isFinite(child.position.x)).toBe(true);
      expect(Number.isFinite(child.position.y)).toBe(true);
      expect(Number.isFinite(child.position.z)).toBe(true);
    }
    expect(scene.children.some((child, index) => !child.position.equals(before[index]!))).toBe(true);
    life.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
