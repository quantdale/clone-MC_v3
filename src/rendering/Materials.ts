import * as THREE from 'three';
import { TextureAtlas } from './TextureAtlas';

/**
 * Shared materials for the voxel world.
 *
 * Materials are created once and reused across all chunk meshes to minimize GPU
 * state changes and memory. The opaque material renders all opaque blocks;
 * the transparent material renders water and glass.
 */
export class Materials {
  readonly opaque: THREE.MeshLambertMaterial;
  readonly transparent: THREE.MeshLambertMaterial;

  constructor(atlas: TextureAtlas) {
    this.opaque = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });

    this.transparent = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }

  dispose(): void {
    this.opaque.dispose();
    this.transparent.dispose();
  }
}
