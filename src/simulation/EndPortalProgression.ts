/**
 * End portal progression (182): the End's entry/exit baseline — portal activation, teleport
 * destination, the obsidian spawn platform, and the return-gateway rule. Pure and deterministic,
 * composed with 178's teleport machinery (the 300-tick cooldown) where the flow needs it.
 *
 * - **Obsidian platform**: vanilla spawns the player on a 5×5 obsidian pad at the End origin
 *   (blocks at y=49, x/z −2..2); `endObsidianPlatformPositions` lists the 25 cells and
 *   `endSpawnPosition` is the standing point above its center.
 * - **End portal activation**: the overworld frame is a 5×5 ring (16 `end_portal_frame` cells:
 *   12 eye slots + 4 corners) around a 3×3 hole; `endPortalIsActivated` requires all
 *   `END_PORTAL_FRAME_COUNT` (12) eyes — modeled as an item requirement per 179's documented blaze/
 *   eyes-of-ender deferral (the eyes are items; the blaze that makes them is 218's scope).
 * - **Teleport**: every End portal entry teleports to `endPortalDestination` (the platform spawn),
 *   gated by 178's `portalCooldownRemaining` via `endTeleportIsReady`.
 * - **Return gateway**: `endReturnGatewayAllowed(dragonDefeated)` is exactly `dragonDefeated` —
 *   the exit portal only exists once the dragon is dead; before 183/184 no defeat state exists, so
 *   the baseline answer is `false`.
 */
import { portalCooldownRemaining, PORTAL_TELEPORT_COOLDOWN_TICKS } from './NetherPortalLinking';

/** The obsidian platform's Y (vanilla). */
export const END_OBSIDIAN_PLATFORM_Y = 49;
/** Half-size of the 5×5 platform (x/z ∈ [−2..2]). */
export const END_OBSIDIAN_PLATFORM_HALF_SIZE = 2;
/** Eyes of ender required to activate the End portal (vanilla: 12). */
export const END_PORTAL_FRAME_COUNT = 12;
/** The End portal frame ring is 5×5 (16 ring cells: 12 eye slots + 4 corners). */
export const END_PORTAL_RING_SIZE = 5;

/** The 25 obsidian platform cells (y = END_OBSIDIAN_PLATFORM_Y, x/z in −2..2). */
export function endObsidianPlatformPositions(): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  for (let dx = -END_OBSIDIAN_PLATFORM_HALF_SIZE; dx <= END_OBSIDIAN_PLATFORM_HALF_SIZE; dx++) {
    for (let dz = -END_OBSIDIAN_PLATFORM_HALF_SIZE; dz <= END_OBSIDIAN_PLATFORM_HALF_SIZE; dz++) {
      cells.push([dx, END_OBSIDIAN_PLATFORM_Y, dz]);
    }
  }
  return cells;
}

/** The player's spawn point: standing on the platform's center (0.5, 50, 0.5). */
export function endSpawnPosition(): readonly [number, number, number] {
  return [0.5, END_OBSIDIAN_PLATFORM_Y + 1, 0.5];
}

/** The 16 ring cells of the 5×5 End portal frame at `y` around (centerX, centerZ). */
export function endPortalFrameCells(
  centerX: number,
  y: number,
  centerZ: number,
): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  const half = Math.floor(END_PORTAL_RING_SIZE / 2);
  for (let dx = -half; dx <= half; dx++) {
    for (let dz = -half; dz <= half; dz++) {
      const onRing = Math.abs(dx) === half || Math.abs(dz) === half;
      if (onRing) cells.push([centerX + dx, y, centerZ + dz]);
    }
  }
  return cells;
}

/** The 9 interior cells of the End portal (filled with portal blocks on activation). */
export function endPortalInteriorCells(
  centerX: number,
  y: number,
  centerZ: number,
): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      cells.push([centerX + dx, y, centerZ + dz]);
    }
  }
  return cells;
}

/** The 12 eye slots (the ring's edge-middle cells; the 4 corners take no eyes). */
export function endPortalEyeCells(
  centerX: number,
  y: number,
  centerZ: number,
): ReadonlyArray<readonly [number, number, number]> {
  const cells: Array<readonly [number, number, number]> = [];
  for (let dx = -1; dx <= 1; dx++) {
    cells.push([centerX + dx, y, centerZ - 2]);
    cells.push([centerX + dx, y, centerZ + 2]);
  }
  for (let dz = -1; dz <= 1; dz++) {
    cells.push([centerX - 2, y, centerZ + dz]);
    cells.push([centerX + 2, y, centerZ + dz]);
  }
  return cells;
}

/** Whether the End portal is activated: all 12 eyes inserted. */
export function endPortalIsActivated(insertedEyeCount: number): boolean {
  return insertedEyeCount >= END_PORTAL_FRAME_COUNT;
}

/** Every End portal entry teleports to the platform spawn (deterministic destination). */
export function endPortalDestination(): readonly [number, number, number] {
  return endSpawnPosition();
}

/** Teleport re-entry is ready when 178's cooldown has fully elapsed. */
export function endTeleportIsReady(lastTeleportTick: number, nowTick: number): boolean {
  return portalCooldownRemaining(lastTeleportTick, nowTick) === 0;
}

/** The return gateway exists exactly when the dragon is defeated (184 owns the defeat state). */
export function endReturnGatewayAllowed(dragonDefeated: boolean): boolean {
  return dragonDefeated;
}

/** Re-exported for tests: the cooldown this module composes with. */
export { PORTAL_TELEPORT_COOLDOWN_TICKS };
