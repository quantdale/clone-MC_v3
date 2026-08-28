import * as THREE from 'three';
import type { EntityInstance } from '../world/Entity';

/**
 * Per-entity-id mesh pool for live hostile-mob entities (146). `sync(zombies)` adds a mesh for
 * every newly-seen id, updates position/yaw for ids still present, and removes meshes for ids no
 * longer in the live set — mirroring `PassiveMobRenderer`'s pattern with a distinct (darker/green,
 * taller) silhouette so a zombie reads visually differently from a pig. New, independent
 * geometry/material instances; no shared state with `PassiveMobRenderer`/`WorldLife`.
 */
export class HostileMobRenderer {
  private readonly scene: THREE.Scene;
  private readonly bodyGeometry = new THREE.BoxGeometry(0.6, 0.9, 0.3);
  private readonly headGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  private readonly legGeometry = new THREE.BoxGeometry(0.18, 0.75, 0.18);
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3a6b3a });
  private readonly headMaterial = new THREE.MeshLambertMaterial({ color: 0x2f4f2f });
  private readonly meshes = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Add/update/remove meshes so the scene holds exactly one per element of `zombies`, by id. */
  sync(zombies: readonly EntityInstance[]): void {
    const liveIds = new Set<number>();

    for (const zombie of zombies) {
      liveIds.add(zombie.id);
      let mesh = this.meshes.get(zombie.id);
      if (!mesh) {
        mesh = this.createZombieMesh();
        this.meshes.set(zombie.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(zombie.transform.x, zombie.transform.y, zombie.transform.z);
      mesh.rotation.y = (zombie.transform.yaw * Math.PI) / 180;
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
    this.headMaterial.dispose();
  }

  private createZombieMesh(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'hostile-mob-zombie';

    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    body.position.y = 1.2;
    group.add(body);

    const head = new THREE.Mesh(this.headGeometry, this.headMaterial);
    head.position.set(0, 1.75, 0);
    group.add(head);

    for (const x of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(this.legGeometry, this.headMaterial);
      leg.position.set(x, 0.375, 0);
      group.add(leg);
    }

    return group;
  }
}
