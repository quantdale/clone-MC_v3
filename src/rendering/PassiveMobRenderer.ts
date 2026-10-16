import * as THREE from 'three';
import type { EntityInstance } from '../world/Entity';

/**
 * Per-entity-id mesh pool for live passive-mob entities (145). `sync(pigs)` adds a mesh for every
 * newly-seen id, updates position/yaw for ids still present, and removes meshes for ids no longer
 * in the live set — mirroring `WorldLife`'s low-poly box aesthetic and its real-`THREE.Scene`,
 * GL-free unit-test pattern. New, independent geometry/material instances; no shared state with
 * `WorldLife`.
 */
export class PassiveMobRenderer {
  private readonly scene: THREE.Scene;
  private readonly bodyGeometry = new THREE.BoxGeometry(0.9, 0.65, 0.52);
  private readonly headGeometry = new THREE.BoxGeometry(0.38, 0.38, 0.38);
  private readonly legGeometry = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf1a7c4 });
  private readonly meshes = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Add/update/remove meshes so the scene holds exactly one per element of `pigs`, by id. */
  sync(pigs: readonly EntityInstance[]): void {
    const liveIds = new Set<number>();

    for (const pig of pigs) {
      liveIds.add(pig.id);
      let mesh = this.meshes.get(pig.id);
      if (!mesh) {
        mesh = this.createPigMesh();
        this.meshes.set(pig.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(pig.transform.x, pig.transform.y, pig.transform.z);
      mesh.rotation.y = (pig.transform.yaw * Math.PI) / 180;
    }

    for (const [id, mesh] of this.meshes) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }

  /** Remove every mesh this renderer added and dispose its shared geometry/material. */
  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
    }
    this.meshes.clear();
    this.bodyGeometry.dispose();
    this.headGeometry.dispose();
    this.legGeometry.dispose();
    this.bodyMaterial.dispose();
  }

  private createPigMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'passive-mob-pig';

    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    body.position.y = 0.48;
    group.add(body);

    const head = new THREE.Mesh(this.headGeometry, this.bodyMaterial);
    head.position.set(0, 0.7, 0.42);
    group.add(head);

    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(this.legGeometry, this.bodyMaterial);
        leg.position.set(x, 0.18, z);
        group.add(leg);
      }
    }

    return group;
  }
}
