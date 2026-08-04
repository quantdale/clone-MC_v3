import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Owns the scene's sun and ambient lighting.
 *
 * A hemisphere light provides soft sky/ground fill; a directional light plays
 * the role of the sun. When CONFIG.dayNight.enabled, the sun is rotated
 * smoothly around the sky so the angle changes slowly and continuously (no
 * flicker); otherwise update() is a no-op.
 */
export class Lighting {
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  /** Fixed rotation axis for the day-night cycle (reused to avoid hot-path allocation). */
  private readonly dayNightAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
    this.hemisphere.position.set(0, 1, 0);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.position.set(0.5, 1, 0.3).normalize();
    scene.add(this.sun);
  }

  /**
   * Advances the day-night cycle. When disabled, does nothing so the static
   * scene lighting is untouched.
   */
  update(dt: number): void {
    if (!CONFIG.dayNight.enabled) return;

    const anglePerSecond = (Math.PI * 2) / CONFIG.dayNight.dayLength;
    this.sun.position.applyAxisAngle(this.dayNightAxis, -anglePerSecond * dt);
  }
}