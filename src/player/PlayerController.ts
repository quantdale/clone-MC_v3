import * as THREE from 'three';
import { CONFIG } from '../config';
import { Player } from './Player';
import { InputState } from '../engine/InputTypes';

/**
 * Player controller.
 *
 * Converts raw input (mouse look + WASD + jump/sprint) into player state. Mouse
 * deltas drive yaw/pitch; WASD drives horizontal velocity with smooth
 * acceleration toward the target speed; jump imparts upward velocity when on
 * the ground.
 */
export class PlayerController {
  private readonly player: Player;
  private readonly input: InputState;

  constructor(player: Player, input: InputState) {
    this.player = player;
    this.input = input;
  }

  update(dt: number): void {
    const d = Math.min(dt, CONFIG.maxDeltaTime);

    // Mouse look. The InputManager already scales deltas by the configured
    // sensitivity, so apply the delta directly to avoid double-scaling.
    const delta = this.input.consumeMouseDelta();
    if (delta.dyaw !== 0 || delta.dpitch !== 0) {
      this.player.yaw -= delta.dyaw;
      this.player.pitch += delta.dpitch;
      this.player.pitch = THREE.MathUtils.clamp(
        this.player.pitch,
        -CONFIG.maxPitch,
        CONFIG.maxPitch,
      );
    }

    // Horizontal movement direction from WASD, relative to yaw.
    const forward = this.input.moveForward ? 1 : 0;
    const back = this.input.moveBack ? 1 : 0;
    const left = this.input.moveLeft ? 1 : 0;
    const right = this.input.moveRight ? 1 : 0;

    const fwd = forward - back;
    const strafe = right - left;

    // Desired movement vector in world space (yaw uses -Z forward convention).
    const sinYaw = Math.sin(this.player.yaw);
    const cosYaw = Math.cos(this.player.yaw);
    const moveX = -sinYaw * fwd + cosYaw * strafe;
    const moveZ = -cosYaw * fwd - sinYaw * strafe;

    const moveLen = Math.hypot(moveX, moveZ);
    const moveDirX = moveLen > 0 ? moveX / moveLen : 0;
    const moveDirZ = moveLen > 0 ? moveZ / moveLen : 0;

    const targetSpeed = this.input.sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
    const targetVX = moveDirX * targetSpeed;
    const targetVZ = moveDirZ * targetSpeed;

    // Smooth acceleration toward the target velocity.
    const accel = CONFIG.player.acceleration * d;
    const damping = CONFIG.player.damping * d;

    this.player.velocity.x = this.horizontalDamp(
      this.player.velocity.x,
      targetVX,
      accel,
      damping,
    );
    this.player.velocity.z = this.horizontalDamp(
      this.player.velocity.z,
      targetVZ,
      accel,
      damping,
    );

    // Jump.
    if (this.input.jump && this.player.onGround) {
      this.player.velocity.y = CONFIG.player.jumpVelocity;
      this.player.onGround = false;
    }
  }

  /**
   * Move the current velocity toward the target. When no target is set, only
   * friction (damping) is applied; otherwise accelerate in the target
   * direction up to the target speed.
   */
  private horizontalDamp(current: number, target: number, accel: number, damping: number): number {
    if (target === 0) {
      // Friction toward zero.
      if (Math.abs(current) <= damping) {
        return 0;
      }
      return current - Math.sign(current) * damping;
    }

    const delta = target - current;
    if (Math.abs(delta) <= accel) {
      return target;
    }
    return current + Math.sign(delta) * accel;
  }
}