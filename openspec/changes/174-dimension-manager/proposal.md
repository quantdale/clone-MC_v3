# Proposal: 174-dimension-manager

## Problem
154-173 closed the redstone/automation arc with a single implicit dimension: `World` accepts an
optional `dimension?: DimensionType` (025) that derives its vertical chunk-layer window, but nothing
can hold *multiple* dimensions at once — no Nether, no End, no per-dimension tick state. The
Dimensions and major progression section (174-195) needs a container where each dimension owns its
own world/chunk state and its own scheduled-tick queue, with 025's height metadata consulted per
dimension.

## Goals
- `LoadedDimension`: `{ key, type: DimensionType, world: WorldAccess, tickQueue:
  ScheduledTickQueue }` — one dimension's complete independent state (world/chunk access + 047 tick
  queue + 025 height/lighting metadata).
- `DimensionManager`:
  - `registerDimension(type, world, tickQueue?)` — the key IS `resourceIdToString(type.id)`
    (e.g. `minecraft:overworld`), so lookups and metadata can never disagree; duplicate keys throw
    `DUPLICATE_ID`; a fresh `ScheduledTickQueue` is created per dimension unless supplied;
  - `hasDimension` / `getDimension` / `getWorld` / `getTickQueue` (unknown keys → `undefined` /
    `false`);
  - `dimensions()` in registration order (deterministic), `size`, `removeDimension(key)`
    (idempotent);
  - `tickAll(nowTick)` — drains every dimension's queue independently at `nowTick`, in registration
    order, returning a key → due-ticks map (deterministic).

## Non-goals
- **No world refactor** — `World` keeps its THREE rendering concerns; the manager works over the
  `WorldAccess` interface `World` already implements, so production and headless fixtures share one
  seam.
- **No dimension-content work** — Nether/End *types* (175/180) and generation (176/181) are later
  changes; 174 only provides the container and its independence guarantees.
- **No teleportation, no dimension persistence, no multi-dimension rendering** — wiring concerns.

## Preconditions
- Change 173 (`redstone-regression-worlds`) is VERIFIED; the Redstone and automation section
  (154-173) is closed.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/DimensionType.ts` (025), `src/simulation/ScheduledTickQueue.ts` (047),
  `src/world/WorldAccess.ts`, `src/data/Registry.ts` (`RegistryError`), `src/data/ResourceId.ts`.

## Proposed change
1. `src/world/DimensionManager.ts` (NEW): `LoadedDimension`, `DimensionManager` with the API above.

## Compatibility and migration
- One new file; zero registry changes, zero characterization updates, no `Game.ts` edit, no schema/
  save-format change. Existing single-world code is untouched.

## Risks
- **Cross-dimension state leakage** (sharing a queue or world across dimensions would break the
  section's independence premise). Mitigation: `registerDimension` always creates a fresh queue when
  none is supplied, and a dedicated test proves edits/ticks never leak between two loaded
  dimensions.
- **Key/type disagreement** (looking up by one name while metadata says another). Mitigation: the
  key is derived from `type.id` — there is no separate key argument to disagree.

## Rollback strategy
One new file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed API implemented per design.md/spec.md.
- Unit tests cover: registration + key derivation; duplicate rejection; queue independence; lookups
  (present/absent); registration order; removal (idempotent); `tickAll` independence, coverage, and
  determinism; per-dimension vertical metadata (025); world-edit isolation.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
