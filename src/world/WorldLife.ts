import * as THREE from 'three';
import { CONFIG } from '../config';
import { PRNG, hash2 } from '../math/PRNG';
import type { TerrainGenerator } from './TerrainGenerator';

interface Critter {
  readonly group: THREE.Group;
  readonly heading: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly rng: PRNG;
  turnClock: number;
  bob: number;
}

/**
 * Small deterministic passive-life layer. Critters are visual-only entities;
 * they do not write blocks or participate in player collision, which keeps the
 * voxel simulation and its bounded streaming queues independent of animation.
 */
export class WorldLife {
  private readonly scene: THREE.Scene;
  private readonly generator: TerrainGenerator;
  private readonly bodyGeometry = new THREE.BoxGeometry(0.9, 0.65, 0.52);
  private readonly headGeometry = new THREE.BoxGeometry(0.38, 0.38, 0.38);
  private readonly legGeometry = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  private readonly eyeGeometry = new THREE.BoxGeometry(0.045, 0.045, 0.02);
  private readonly bodyMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xf1eee3 }),
    new THREE.MeshLambertMaterial({ color: 0xb88758 }),
  ];
  private readonly faceMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2020 });
  private readonly critters: Critter[] = [];
  private readonly offsets: THREE.Vector3[] = [];
  private anchoredToPlayer = false;

  constructor(scene: THREE.Scene, generator: TerrainGenerator, seed: number, count = 8) {
    this.scene = scene;
    this.generator = generator;
    const rng = new PRNG((seed ^ 0x7f4a7c15) >>> 0);
    for (let index = 0; index < count; index++) {
      let offset: THREE.Vector3;
      do {
        offset = new THREE.Vector3(rng.range(-42, 42), 0, rng.range(-42, 42));
      } while (offset.length() < 20);
      this.offsets.push(offset);
      const group = this.createCritter(index % this.bodyMaterials.length);
      group.position.set(
        offset.x,
        generator.getHeightAt(Math.floor(offset.x), Math.floor(offset.z)) + 1.02,
        offset.z,
      );
      const critter: Critter = {
        group,
        heading: new THREE.Vector3(1, 0, 0),
        target: new THREE.Vector3(),
        rng: new PRNG(hash2(index, 19, seed)),
        turnClock: 0,
        bob: rng.range(0, Math.PI * 2),
      };
      this.critters.push(critter);
      scene.add(group);
    }
  }

  update(dt: number, playerPosition: THREE.Vector3): void {
    const d = Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
    if (!this.anchoredToPlayer) {
      // Game constructs world life before it resolves the safest spawn column;
      // anchor the deterministic offsets on the first active update so a
      // critter cannot accidentally spawn on top of the player.
      for (let index = 0; index < this.critters.length; index++) {
        const critter = this.critters[index]!;
        const offset = this.offsets[index]!;
        critter.group.position.x = playerPosition.x + offset.x;
        critter.group.position.z = playerPosition.z + offset.z;
      }
      this.anchoredToPlayer = true;
    }
    for (let index = 0; index < this.critters.length; index++) {
      const critter = this.critters[index]!;
      if (d > 0) {
        critter.turnClock -= d;
        if (critter.turnClock <= 0) {
          critter.turnClock = critter.rng.range(1.5, 4.5);
          critter.target.set(critter.rng.range(-1, 1), 0, critter.rng.range(-1, 1)).normalize();
          critter.heading.lerp(critter.target, 0.7).normalize();
        }
        const speed = critter.rng.range(0.25, 0.55);
        critter.group.position.x += critter.heading.x * speed * d;
        critter.group.position.z += critter.heading.z * speed * d;
        critter.group.rotation.y = Math.atan2(critter.heading.x, critter.heading.z);
        critter.bob += d * 8;
      }

      const dx = critter.group.position.x - playerPosition.x;
      const dz = critter.group.position.z - playerPosition.z;
      if (Math.hypot(dx, dz) > 110) {
        const offset = this.offsets[index]!;
        critter.group.position.x = playerPosition.x + offset.x;
        critter.group.position.z = playerPosition.z + offset.z;
      }
      const surface = this.generator.getHeightAt(
        Math.floor(critter.group.position.x),
        Math.floor(critter.group.position.z),
      );
      critter.group.position.y = surface + 1.02 + Math.sin(critter.bob) * 0.025;
    }
  }

  dispose(): void {
    for (const critter of this.critters) {
      this.scene.remove(critter.group);
    }
    this.bodyGeometry.dispose();
    this.headGeometry.dispose();
    this.legGeometry.dispose();
    this.eyeGeometry.dispose();
    for (const material of this.bodyMaterials) material.dispose();
    this.faceMaterial.dispose();
    this.critters.length = 0;
    this.offsets.length = 0;
    this.anchoredToPlayer = false;
  }

  private createCritter(variant: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'passive-critter';
    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterials[variant]!);
    body.position.y = 0.48;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const head = new THREE.Mesh(this.headGeometry, this.bodyMaterials[variant]!);
    head.position.set(0, 0.7, 0.42);
    head.castShadow = true;
    group.add(head);
    const eye = new THREE.Mesh(this.eyeGeometry, this.faceMaterial);
    eye.position.set(-0.09, 0.76, 0.61);
    head.add(eye);
    const otherEye = eye.clone();
    otherEye.position.x = 0.09;
    head.add(otherEye);

    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(this.legGeometry, this.bodyMaterials[variant]!);
        leg.position.set(x, 0.18, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    return group;
  }
}
