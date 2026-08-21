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

  /** Auto-jump latch (206): armed while airborne, consumed by one landing jump. */
  private autoJumpArmed = false;
  /** True when the previous airborne phase was started by the auto-jump itself. */
  private autoJumpLanded = false;
  /** True when the previous airborne phase was started by a held-jump input. */
  private manualJumped = false;

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

    // Horizontal movement direction from WASD plus the optional analog
    // gamepad/touch contribution (246, coordinator axis convention:
    // y = -forward), relative to yaw. Opposite inputs cancel.
    const forward = this.input.moveForward ? 1 : 0;
    const back = this.input.moveBack ? 1 : 0;
    const left = this.input.moveLeft ? 1 : 0;
    const right = this.input.moveRight ? 1 : 0;
    const analog = this.input.analogMove?.() ?? { x: 0, y: 0 };

    const fwd = forward - back - analog.y;
    const strafe = right - left + analog.x;

    // Desired movement vector in world space (yaw uses -Z forward convention).
    const sinYaw = Math.sin(this.player.yaw);
    const cosYaw = Math.cos(this.player.yaw);
    const moveX = -sinYaw * fwd + cosYaw * strafe;
    const moveZ = -cosYaw * fwd - sinYaw * strafe;

    const moveLen = Math.hypot(moveX, moveZ);
    const moveDirX = moveLen > 0 ? moveX / moveLen : 0;
    const moveDirZ = moveLen > 0 ? moveZ / moveLen : 0;

    const baseSpeed = this.input.sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
    const targetSpeed = this.player.inWater
      ? baseSpeed * CONFIG.player.waterSpeedMultiplier
      : this.player.inLava
        ? baseSpeed * 0.35
        : baseSpeed;
    const targetVX = moveDirX * targetSpeed;
    const targetVZ = moveDirZ * targetSpeed;

    // Smooth acceleration toward the target velocity.
    const fluidFactor = this.player.inWater
      ? CONFIG.player.waterSpeedMultiplier
      : this.player.inLava
        ? 0.35
        : 1;
    const accel = CONFIG.player.acceleration * fluidFactor * d;
    const damping = CONFIG.player.damping * fluidFactor * d;

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
    if (this.input.jump && (this.player.onGround || this.player.inWater)) {
      this.player.velocity.y = this.player.inWater
        ? CONFIG.player.swimUpVelocity
        : CONFIG.player.jumpVelocity;
      this.player.onGround = false;
      this.manualJumped = true;
    }
    // Auto-jump (206): when enabled and jump is not held, trigger a single
    // automatic jump on landing. Armed while airborne and consumed by exactly
    // one jump so it cannot bounce continuously; landings that follow a manual
    // jump or the auto-jump's own hop do not re-trigger.
    if (!this.player.onGround) {
      this.autoJumpArmed = true;
    } else if (this.autoJumpArmed) {
      this.autoJumpArmed = false;
      const suppressed = this.manualJumped || this.autoJumpLanded;
      this.manualJumped = false;
      this.autoJumpLanded = false;
      if (
        !suppressed &&
        !this.input.jump &&
        !this.player.inWater &&
        this.input.wantsAutoJump?.() === true
      ) {
        this.player.velocity.y = CONFIG.player.jumpVelocity;
        this.player.onGround = false;
        this.autoJumpLanded = true;
      }
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
