import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Player state.
 *
 * Holds the player's position (feet center), velocity, look direction, and
 * physics-derived fields. The Player is a plain data holder — movement and
 * collision are driven by PlayerController and PlayerPhysics.
 */
export interface PlayerOptions {
  /** Initial feet-center position. */
  position?: THREE.Vector3;
  /** Initial yaw in radians (rotation around the vertical axis). */
  yaw?: number;
  /** Initial pitch in radians (rotation around the horizontal axis). */
  pitch?: number;
}

export class Player {
  /** Feet-center position in world coordinates. */
  position: THREE.Vector3;
  /** Velocity in blocks per second. */
  velocity: THREE.Vector3;
  /** Yaw in radians (positive = look right). */
  yaw: number;
  /** Pitch in radians (positive = look up). */
  pitch: number;
  /** Whether the player is currently standing on solid ground. */
  onGround: boolean;
  /** Full height of the player AABB in blocks. */
  height: number;
  /** Half-width of the player AABB in blocks. */
  radius: number;

  constructor(opts: PlayerOptions = {}) {
    this.position = opts.position ? opts.position.clone() : new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = opts.yaw ?? 0;
    this.pitch = opts.pitch ?? 0;
    this.onGround = false;
    this.height = CONFIG.player.height;
    this.radius = CONFIG.player.radius;
  }

  /** Eye position (feet center + eye height). Cached and recomputed only when the position changes. */
  get eyePosition(): THREE.Vector3 {
    if (
      this._eyeBase.x !== this.position.x ||
      this._eyeBase.y !== this.position.y ||
      this._eyeBase.z !== this.position.z
    ) {
      this._eyeBase.copy(this.position);
      this._eye.set(this.position.x, this.position.y + CONFIG.player.eyeHeight, this.position.z);
    }
    return this._eye;
  }

  /** Cached eye vector; recomputed in {@link eyePosition} when the position changes. */
  private readonly _eye: THREE.Vector3 = new THREE.Vector3();
  /** Snapshot of the position the cached eye vector was computed from. */
  private readonly _eyeBase: THREE.Vector3 = new THREE.Vector3();
}