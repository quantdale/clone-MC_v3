# Proposal: 210-touch-controls

## Problem
209 covered gamepads, but mobile is uncovered: no touch zones, no drag-based look/movement, no
touch-to-action mapping, no responsive-layout primitives. The touch HUD needs a pure model the
wiring can feed normalized touch points into.

## Goals
- `src/simulation/TouchFramework.ts` (NEW), pure and headless-safe:
  - **Zones**: the fixed `TOUCH_ZONES` table of 7 normalized (0..1) zones — `move` (left half),
    `look` (right half), `jump`, `sneak`, `attack`, `use`, `inventory` (vanilla-mobile-inspired
    button rects, each carrying the 207 action it triggers); `zoneAt(point)` hit test (first
    match in zone order; null outside every zone).
  - **Drags**: `TouchDrag { zone, start, current }`; `dragVector(drag)` — the move vector
    (offset scaled 4x, clamped to [-1, 1], 209's deadzone applied) and `dragDelta(drag)` — the
    raw look offset.
  - **Resolution**: `resolveTouches(touches)` — maps a list of `{ point, previous? }` touches to
    `TouchInputState { actions, move, lookDelta }`: button zones push their actions (deduped),
    move zones yield the drag vector (last touch wins), look zones yield the drag delta.

## Non-goals
- **No pointer-event capture** (the wiring feeds normalized points), **no HUD rendering** (the
  UI layer draws the zones), **no pinch gestures** (211+), **no change to 209/207**, **no
  `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 209 (`gamepad-controls`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 209's `applyDeadzone` / `GamepadAxisPair` (imported; reused, not modified).

## Proposed change
1. `src/simulation/TouchFramework.ts` (NEW): the zone table, hit test, drag math, and touch
   resolution.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Zone/gesture drift**. Mitigation: the zone rects, the hit-test precedence, and the exact
  drag math (scale 4, clamp, deadzone) are pinned in tests.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the zone table (7 zones, rects, actions); zoneAt (inside/outside/overlap
  precedence); dragVector (scale/clamp/deadzone boundaries) and dragDelta; resolveTouches (button
  dedupe, move/look drags, no touches, last-touch-wins, previous-less touches).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
