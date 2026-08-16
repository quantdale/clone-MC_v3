# Design: 182-end-portal-progression

## Context/current state
- 181 generates the End's main island; 178's `NetherPortalLinking` provides the 300-tick teleport
  cooldown. 179 documented eyes-of-ender as an item requirement (the blaze is 218's scope).
- 182 composes these into the End's entry/exit baseline, purely.

## Target state
- `src/simulation/EndPortalProgression.ts` holding the platform, frame geometry, activation,
  teleport destination/gating, and return-gateway rule.

## Invariants
- `endObsidianPlatformPositions` returns exactly 25 distinct cells at y=49 covering x/z −2..2;
  `endSpawnPosition` is `[0.5, 50, 0.5]`.
- The 5×5 frame ring has exactly 16 cells; the interior exactly 9; no overlap; the 12 eye slots are
  the edge-middle cells (corners excluded).
- `endPortalIsActivated(n)` is `n >= 12`.
- `endPortalDestination` is the platform spawn; `endTeleportIsReady` is 178's cooldown at 0.
- `endReturnGatewayAllowed(dragonDefeated)` is exactly `dragonDefeated`.

## API and data model
```ts
// src/simulation/EndPortalProgression.ts (new)
export const END_OBSIDIAN_PLATFORM_Y = 49;
export const END_OBSIDIAN_PLATFORM_HALF_SIZE = 2;
export const END_PORTAL_FRAME_COUNT = 12;
export const END_PORTAL_RING_SIZE = 5;

export function endObsidianPlatformPositions(): ReadonlyArray<readonly [number, number, number]>;
export function endSpawnPosition(): readonly [number, number, number];
export function endPortalFrameCells(centerX: number, y: number, centerZ: number): ReadonlyArray<readonly [number, number, number]>;
export function endPortalInteriorCells(centerX: number, y: number, centerZ: number): ReadonlyArray<readonly [number, number, number]>;
export function endPortalEyeCells(centerX: number, y: number, centerZ: number): ReadonlyArray<readonly [number, number, number]>;
export function endPortalIsActivated(insertedEyeCount: number): boolean;
export function endPortalDestination(): readonly [number, number, number];
export function endTeleportIsReady(lastTeleportTick: number, nowTick: number): boolean;
export function endReturnGatewayAllowed(dragonDefeated: boolean): boolean;
```

## Control/data flow
1. A wiring change builds the platform from `endObsidianPlatformPositions` at the End origin and
   spawns the entering player at `endSpawnPosition`.
2. The overworld frame is built from `endPortalFrameCells`/`endPortalEyeCells`; inserting the 12th
   eye flips `endPortalIsActivated` to true, and the wiring fills `endPortalInteriorCells` with
   portal blocks.
3. Entering the portal teleports to `endPortalDestination`, gated by `endTeleportIsReady`.
4. The return gateway is `endReturnGatewayAllowed(dragonDefeated)` — 183/184 own the defeat state.

## Detailed behavior
- The platform and frame geometry are exact vanilla numbers (5×5, y=49, 12 eyes, 3×3 hole).
- The return-gateway rule is deliberately the simplest baseline: the boolean passes through; its
  meaning ("the exit portal exists iff the dragon is dead") is what 184 implements.

## Failure modes
- No function throws for well-formed inputs; geometry functions are total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All functions O(ring/interior) ≤ O(25).

## Testing seams
- Tests use pure assertions over the geometry sets and the real 178 cooldown.

## Observability/debugging
- All results are plain values; geometry sets are enumerable.

## Affected files/symbols
- `src/simulation/EndPortalProgression.ts` (new).
- Tests: `tests/unit/EndPortalProgression.test.ts` (new). No other files.

## Rejected alternatives
- **Full frame validation (177-style) for the End portal**: rejected — the End portal is built by
  the player from placed frames, not validated as a natural frame; the geometry helpers + eye count
  are the right abstraction.
- **Owning the dragon-defeat state here**: rejected — 183/184 own it; this module consumes the
  boolean.

## Downstream dependencies
- 183 (`ender-dragon-boss`) consumes `endReturnGatewayAllowed` with its defeat state; 184 (exit
  progression) implements the actual return portal; 242's survival e2e runs the full entry→fight→
  exit loop.
