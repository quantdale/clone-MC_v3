# Design: 178-nether-portal-linking

## Context/current state
- 177's `NetherPortal.ts` validates frames and yields `PortalShape`s; nothing crosses dimensions.
  174's `DimensionManager` holds the target dimension's world; 178 computes everything needed to
  link a portal in one dimension to one in the other — purely, over a `PortalLinkingWorld` seam.

## Target state
- `src/simulation/NetherPortalLinking.ts` holding the scale rule, search, creation site, cooldown,
  and safe-spawn helpers.

## Invariants
- `scalePortalPosition`: toward the nether = `floor(x/8)` (floor division, negatives included);
  toward the overworld = `x*8`.
- `findNearestPortal` scans `y` ascending (0 then ±dy), then `x`, then `z` within `±radius`; the
  first portal block wins; `null` when none.
- `portalSpawnPoint` centers along the shape's axis at the bottom interior row; `portalSpawnIsSafe`
  requires the spawn cell AND the cell above to be non-solid.
- `portalCooldownRemaining` = `max(0, last + 300 − now)`; non-finite inputs yield the full cooldown.
- `portalCreationSite` searches downward (0..64) then outward (±8) for the first minimal site whose
  four below-bar cells are solid and whose 14 ring + 6 interior cells are all air.
- `portalFrameCells` returns exactly 14 ring cells and `width×height` interior cells.

## API and data model
```ts
// src/simulation/NetherPortalLinking.ts (new)
export const NETHER_PORTAL_SCALE = 8;
export const PORTAL_SEARCH_RADIUS_OVERWORLD = 128;
export const PORTAL_SEARCH_RADIUS_NETHER = 16;
export const PORTAL_TELEPORT_COOLDOWN_TICKS = 300;

export type PortalTravelDirection = 'overworld-to-nether' | 'nether-to-overworld';
export interface PortalLinkingWorld {
  isPortalBlock(x: number, y: number, z: number): boolean;
  isAir(x: number, y: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
}

export function scalePortalPosition(x: number, z: number, direction: PortalTravelDirection): readonly [number, number];
export function portalSearchRadius(direction: PortalTravelDirection): number;
export function findNearestPortal(world: PortalLinkingWorld, cx: number, cy: number, cz: number, radius: number): readonly [number, number, number] | null;
export function portalSpawnPoint(shape: PortalShape): readonly [number, number, number];
export function portalSpawnIsSafe(world: PortalLinkingWorld, x: number, y: number, z: number): boolean;
export function portalCooldownRemaining(lastTeleportTick: number, nowTick: number): number;
export function portalCreationSite(world: PortalLinkingWorld, x: number, y: number, z: number): PortalShape | null;
export function portalFrameCells(shape: PortalShape): {
  readonly frame: ReadonlyArray<readonly [number, number, number]>;
  readonly interior: ReadonlyArray<readonly [number, number, number]>;
};
```

## Control/data flow
1. A wiring change computes `scalePortalPosition(portalX, portalZ, direction)` and
   `portalSearchRadius(direction)`.
2. It calls `findNearestPortal` around the scaled position; on a hit it validates the frame (177)
   and computes the spawn via `portalSpawnPoint`/`portalSpawnIsSafe`.
3. On a miss it calls `portalCreationSite` and, using `portalFrameCells`, places the obsidian ring
   and portal interior, then spawns at the site's spawn point.
4. The cooldown gates re-entry via `portalCooldownRemaining`.

## Detailed behavior
- Floor division for the nether matches vanilla exactly (a player at overworld x=7 arrives at
  nether x=0).
- The search box is deterministic so two calls with the same world find the same portal.
- The creation site only accepts clear interiors/rings, so the wiring never places obsidian into
  existing blocks.

## Failure modes
- No function throws for well-formed inputs; search/site misses yield `null` (total); non-finite
  cooldown inputs yield the full cooldown (safe default).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Search is O((2r+1)² × (2r+1)) box probes (128³ worst case in the overworld direction — acceptable
  for a one-shot lookup); site search ≤ 65 × 17² × O(ring+interior).

## Testing seams
- Tests use in-memory `PortalLinkingWorld` fixtures (portal/solid/air sets) and 177's `PortalShape`.

## Observability/debugging
- All results are plain values; `portalFrameCells` makes the build plan explicit.

## Affected files/symbols
- `src/simulation/NetherPortalLinking.ts` (new).
- Tests: `tests/unit/NetherPortalLinking.test.ts` (new). No other files.

## Rejected alternatives
- **Distance-ordered portal search**: rejected — deterministic axis order is simpler and the
  tie-breaking is documented; vanilla's own ordering is not distance-exact either.
- **Auto-lighting / auto-teleport inside the module**: rejected — those are wiring mutations; the
  module computes the plan.
- **A spiral creation search**: rejected — the downward-then-outward order is deterministic,
  bounded, and sufficient for a baseline.

## Downstream dependencies
- 179 (`nether-content-baseline`) supplies netherrack/obsidian identity through the seams; 242
  (survival-progression-e2e) exercises the full overworld→nether→overworld round trip through these
  helpers.
