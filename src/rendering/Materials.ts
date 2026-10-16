import * as THREE from 'three';
import { TextureAtlas } from './TextureAtlas';

/**
 * Shared materials for the voxel world.
 *
 * Materials are created once and reused across all chunk meshes to minimize GPU
 * state changes and memory. The opaque material renders all opaque blocks; the
 * cutout material renders alpha-tested foliage-style geometry (no blend); the
 * transparent material renders glass; the fluid material renders water and other
 * translucent fluid surfaces (depthWrite off so overlaps stay visible).
 */
export class Materials {
  readonly opaque: THREE.MeshLambertMaterial;
  readonly transparent: THREE.MeshLambertMaterial;
  readonly cutout: THREE.MeshLambertMaterial;
  readonly fluid: THREE.MeshLambertMaterial;

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

    // Alpha-tested cutout stream: discards fully transparent texels without
    // entering the blended transparency pass.
    this.cutout = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });

    // Fluid stream: blended like the transparent pass but never writes depth,
    // so stacked fluid surfaces do not occlude one another.
    this.fluid = new THREE.MeshLambertMaterial({
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
    this.cutout.dispose();
    this.fluid.dispose();
  }
}
