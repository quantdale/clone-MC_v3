import * as THREE from 'three';
import { CONFIG } from '../config';
import { CHUNK_DIMENSIONS } from '../world/WorldCoordinates';

/**
 * Manages the scene's environment (fog). Fog far is derived from the render
 * distance so the fog hides the chunk-loading boundary.
 */
export class Environment {
  private readonly fog: THREE.Fog;

  constructor(scene: THREE.Scene, renderDistance: number) {
    // The load square spans renderDistance chunks in each direction (Chebyshev);
    // its diagonal corners sit ~√2× further than the axis-aligned edge, so the
    // fog must reach that far or the corner chunks would be 100% fogged and
    // permanently invisible. Add a small margin beyond the corner distance.
    const chunkSpan = renderDistance * CHUNK_DIMENSIONS.width;
    const maxCornerDistance = chunkSpan * Math.SQRT2;
    const far = maxCornerDistance * 1.1;
    const near = far * CONFIG.fog.near;
    const fogFar = far * CONFIG.fog.far;
    this.fog = new THREE.Fog(CONFIG.fog.color, near, fogFar);
    scene.fog = this.fog;
  }

  /** Placeholder for camera-driven updates; retained for future tuning. */
  update(camera: THREE.PerspectiveCamera): void {
    void camera;
  }
}