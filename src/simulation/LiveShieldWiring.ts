/** Pure adapters at the boundary between Player's yaw and ShieldBlocking. */

/**
 * Convert Player's radian yaw (`0` looks along -Z) to ShieldBlocking's degree
 * bearing (`0` points along +Z), normalized to the framework's [-180, 180) form.
 */
export function playerYawToShieldBearing(yawRadians: number): number {
  if (!Number.isFinite(yawRadians)) return 0;
  const degrees = 180 + (yawRadians * 180) / Math.PI;
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

/** Whether the current input/equipment state may raise the shield. */
export function canRaiseShield(
  pointerLocked: boolean,
  interactive: boolean,
  useHeld: boolean,
  shieldEquipped: boolean,
  disabled: boolean,
): boolean {
  return pointerLocked && interactive && useHeld && shieldEquipped && !disabled;
}
