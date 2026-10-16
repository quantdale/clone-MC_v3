# Proposal: 163-piston-move-planner

## Problem
154-162 built redstone signal production and simple state consumption, but nothing in this
codebase can yet answer "if a piston at this position pushed right now, what would actually
happen?" Vanilla pistons push a bounded chain of blocks, refuse to push at all if any block in the
chain is immovable or the chain is too long, and destroy certain blocks (torches, dust, tall grass)
they encounter instead of pushing them. Without a planner, no future piston-execution change (164)
has anything correct to execute. This change is **planning/validation only** — it computes what a
push would do; it does not move, place, or destroy a single block.

## Goals
- `PistonWorld` (injected, 154's seam): `isImmovable`/`isPushable`/`isDestroyedByPush` per position.
- `classifyPistonBlock(world, x, y, z)`: one of `'movable' | 'terminates-clear' |
  'terminates-destroy' | 'immovable'` — `isImmovable` takes precedence over `isPushable` even for a
  misbehaving world that reports both, so a chain can never be reported movable through a position
  that is also immovable.
- `PISTON_PUSH_LIMIT = 12` (vanilla's push limit).
- `planPistonPush(world, x, y, z, facing)`: walks outward from `(x, y, z)` in `facing` (154's
  six-way `Direction`, since pistons can point up/down) classifying each position in turn:
  - a `movable` position joins the chain and the walk continues;
  - a `terminates-clear`/`terminates-destroy` position ends the chain successfully — the plan's
    `blocksToMove` (farthest-to-nearest, the order 164 will need to apply moves without
    overwriting) contains every movable position found, and `blocksToDestroy` contains the
    terminating position only if it was `terminates-destroy`;
  - an `immovable` position, at any point in the chain, blocks the push entirely — `canPush` is
    `false`, `blocksToMove`/`blocksToDestroy` are both empty, and `blockedReason` is `'immovable'`;
  - exceeding `PISTON_PUSH_LIMIT` movable positions before a terminator or an immovable block is
    found also blocks the push entirely, with `blockedReason` `'exceeded-limit'`.

## Non-goals
- **No actual block movement, placement, or destruction.** That is 164's (`piston-execution`)
  separate titled scope; this change never mutates a `World`.
- **No `Piston` `BlockId`/`ItemId`.** This change is pure push-chain validation logic behind an
  injected `PistonWorld` seam; a real piston block appears when 164 needs one to execute against —
  the same "algorithm first, block second" ordering 154 (signal core, no block) established before
  155 (wire block) added one.
- **No sticky-piston pull-on-retract behavior.** That belongs to 165 (`slime-honey-move-groups`),
  which owns sticky adjacency/grouping rules specifically.
- **No piston extend/retract triggering** (mapping `powered` to "should this piston try to push
  right now") — that is an execution-time concern for 164, not a push-chain validation concern.
- **No `Game`/`World` wiring** — the same integration surface 154-162 deferred.

## Preconditions
- Change 162 (`redstone-consumer-blocks`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `Direction`/`offsetInDirection` only — no signal-strength
  dependency, since this module reasons about block movement, not power values).

## Proposed change
1. `src/simulation/PistonMovePlanner.ts` (NEW): `PistonWorld`, `classifyPistonBlock`,
   `PISTON_PUSH_LIMIT`, `PistonPushPlan`, `planPistonPush`.

## Compatibility and migration
- One new simulation file; no registry changes at all (the first redstone-arc change with zero
  `BlockRegistry.ts`/`ItemRegistry.ts` touch, following 133-140's pure-algorithm precedent). No
  characterization-test updates are needed as a result. No `Game.ts` edit; no schema/save-format
  change.

## Risks
- **The order of `blocksToMove` is easy to get backwards** (nearest-to-farthest would overwrite
  occupied space if 164 applied moves in that order). Mitigation: a dedicated test asserts the
  farthest-to-nearest order explicitly with distinguishable positions.
- **Immovable-takes-precedence is easy to get backwards** if a future `PistonWorld` implementation
  reports both `isImmovable` and `isPushable` true for the same position. Mitigation: a dedicated
  test exercises exactly that inconsistent input and asserts `immovable` wins.

## Rollback strategy
One new file with no registry footprint; reverting removes the feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: `classifyPistonBlock`'s four outcomes including the immovable-precedence case;
  `planPistonPush`'s immediate-clear/immediate-destroy/movable-then-clear/movable-then-destroy
  success paths with correct move ordering; immovable-blocks-entirely at the first position and
  after some movable blocks; exactly-at-limit success; exceeds-limit failure; all six `Direction`
  values walk in the geometrically correct direction.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
