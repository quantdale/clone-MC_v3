# Proposal: 165-slime-honey-move-groups

## Problem
163-164 handle only a straight-line push chain. Vanilla slime/honey blocks are *sticky*: any block
touching one on any of its six faces gets dragged along too, potentially cascading through a whole
connected cluster — a fundamentally different shape (a graph expansion, not a line walk). Sticky
pistons additionally *pull* the block in front of them back on retract, something no piston does
today. Without this change, no piston in this codebase can move anything but a single straight
line, and nothing can retract-pull at all. This closes the piston sub-arc (163-165).

## Goals
- `StickyKind = 'slime' | 'honey'`; `StickyWorld` (injected, 154's seam): `stickyKind(x, y, z):
  StickyKind | null`.
- `wouldDrag(current: StickyKind, neighbor: StickyKind | null): boolean` — `true` when the
  neighbor is non-sticky (a passive passenger) or shares the *same* sticky kind as `current`;
  `false` when the neighbor is a *different* sticky kind (vanilla's slime-does-not-stick-to-honey
  rule) — only a sticky block's neighbors are ever tested this way; a dragged non-sticky passenger
  is a dead end for further expansion.
- `expandStickyGroup(pistonWorld, stickyWorld, seeds, maxGroupSize)`: a bounded breadth-first
  expansion from `seeds` — reusing 163's `classifyPistonBlock` for every newly-discovered
  neighbor — that grows the group through sticky connections until no more neighbors qualify,
  fails the whole group (`canMove: false`) the instant any discovered neighbor is `'immovable'`,
  and fails it (`'exceeded-limit'`) if the group would exceed `maxGroupSize` (163's
  `PISTON_PUSH_LIMIT`, applied to the *whole group* this time, not a single line).
- `orderGroupForMove(positions, movementDirection)`: sorts a group by decreasing projection onto
  `movementDirection` — the direct generalization of 163's farthest-first rule to an arbitrary set
  of positions that all move by the same one-block offset, so 164's existing `executePistonPush`
  can apply the result unchanged.
- `extendPushPlanWithStickyGroup(basePlan, pistonWorld, stickyWorld, facing)`: given 163's own
  linear plan, expands it to include anything stuck to a sticky block already in `blocksToMove`,
  re-sorting the combined set with `orderGroupForMove`. Applies to *any* piston, sticky or not —
  slime/honey stickiness is a property of the block being pushed, not of the pushing piston.
- `planStickyRetract(pistonWorld, stickyWorld, x, y, z, facing)`: the sticky-piston-only retract
  behavior — pulls the single block directly in front back toward the piston (and, if that block
  is itself sticky, cascades via `expandStickyGroup` in the pull direction). Produces the same
  `PistonPushPlan` shape 163 already defines, so 164's `executePistonPush` executes a pull exactly
  like a push.
- A `sticky_piston` block reusing 164's `PISTON_SCHEMA` unchanged (identical `facing`/`extended`
  shape — the only difference between the two blocks is which retract behavior a future wiring
  change invokes) and a placing item.

## Non-goals
- **No `slime_block`/`honey_block` `BlockId`.** Out of scope for a piston/redstone change;
  `StickyWorld.stickyKind` is injected (154's seam), so the grouping algorithm needs no real block
  to exist — the same reasoning 163 used to test `PistonWorld` with plain object literals rather
  than needing real obsidian/bedrock blocks.
- **No actual `World`/`Game` wiring** — the same integration surface 154-164 deferred.
- **No new execution primitive.** `extendPushPlanWithStickyGroup`/`planStickyRetract` both produce
  ordinary `PistonPushPlan`s; 164's `executePistonPush`/`pistonAffectedPositions` apply and report
  on them completely unchanged.

## Preconditions
- Change 164 (`piston-execution`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/PistonMovePlanner.ts` (163, `PistonWorld`/`classifyPistonBlock`/
  `PistonPushPlan`/`PISTON_PUSH_LIMIT`), `src/simulation/RedstoneSignal.ts` (154,
  `Direction`/`DIRECTIONS`/`OPPOSITE_DIRECTION`/`DIRECTION_OFFSETS`/`offsetInDirection`),
  `src/world/BlockRegistry.ts` (`PISTON_SCHEMA`, reused) + `src/inventory/ItemRegistry.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `BlockId.StickyPiston = 49`, reusing `PISTON_SCHEMA`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.StickyPiston = 49` placing it.
3. `src/simulation/PistonStickyGroups.ts` (NEW): `StickyKind`, `StickyWorld`, `wouldDrag`,
   `expandStickyGroup`, `orderGroupForMove`, `extendPushPlanWithStickyGroup`,
   `planStickyRetract`.

## Compatibility and migration
- One additive block id and one additive item id (reusing an existing schema instance, 162's
  one-schema-many-blocks precedent) plus one new simulation file. Requires the documented four
  block/item characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Risks
- **The projection-based execution order is a novel generalization, not something vanilla's own
  source structure documents this way.** Mitigation: design.md proves the ordering is safe (a
  member's destination can only be occupied by another member exactly one step further along the
  movement direction, which the sort guarantees moves first), and a dedicated test moves an
  L-shaped group (not just a straight line) and asserts the exact final world state.
- **Slime-does-not-stick-to-honey is easy to invert.** Mitigation: a dedicated test drags a plain
  block into a slime group, confirms an adjacent honey block is *not* dragged by a slime neighbor,
  and confirms two same-kind sticky blocks *do* drag each other.

## Rollback strategy
One new file plus two additive registry entries (reusing an existing schema) and their test
updates; reverting removes the feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 12-state enumeration (same states as `piston`);
  `wouldDrag`'s three cases (non-sticky passenger, same-kind, different-kind); `expandStickyGroup`
  growing through a chain, stopping at non-sticky/terminator neighbors, failing on an immovable
  neighbor, failing over the group-size limit; `orderGroupForMove` on a non-linear (L-shaped) group;
  `extendPushPlanWithStickyGroup` leaving a non-sticky-only plan unchanged and growing a
  sticky-containing plan; `planStickyRetract` pulling a single block, cascading through a sticky
  neighbor, and reporting no-op-but-successful when nothing is in front.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
