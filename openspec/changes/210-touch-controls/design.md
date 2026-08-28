# Design: 210-touch-controls

## Context/current state
- 209 provides deadzone and stick vectors for gamepads. Touch input is missing entirely. 210
  adds the pure touch model: normalized zones, hit testing, drag math, and touch-to-action
  resolution; the UI layer draws the zones and the wiring feeds normalized touch points.

## Target state
- `src/simulation/TouchFramework.ts` holding the zone table, `zoneAt`, the drag math, and
  `resolveTouches`.

## Invariants
- Pure and headless-safe: no pointer capture, no mutation of inputs, no throws.
- Points and rects are normalized to [0, 1]; `zoneAt` returns the FIRST matching zone in table
  order (button zones first, so they win where their rects overlap the half-screen zones), or
  null.
- `dragVector` = deadzone(clamp((current - start) * 4, -1, 1)) per axis (full deflection at a
  quarter of the screen); `dragDelta` is the raw offset.
- `resolveTouches` dedupes button actions, uses the LAST move/look touch, and never mutates the
  input.

## API and data model
```ts
// src/simulation/TouchFramework.ts (new)
export type TouchZoneId = 'move' | 'look' | 'jump' | 'sneak' | 'attack' | 'use' | 'inventory';
export interface TouchZone {
  id: TouchZoneId;
  x: number; y: number; width: number; height: number;   // normalized [0,1]
  action?: KeybindingAction;                             // button zones only
}
export const TOUCH_ZONES: readonly TouchZone[];
export function zoneAt(point: TouchPoint, zones?: readonly TouchZone[]): TouchZoneId | null;

export interface TouchPoint { x: number; y: number; }    // normalized [0,1]
export interface TouchDrag { zone: TouchZoneId; start: TouchPoint; current: TouchPoint; }
export function dragVector(drag: TouchDrag): GamepadAxisPair;
export function dragDelta(drag: TouchDrag): GamepadAxisPair;

export interface TouchInput {
  point: TouchPoint;
  previous?: TouchPoint;
}
export interface TouchInputState {
  actions: KeybindingAction[];
  move: GamepadAxisPair;
  lookDelta: GamepadAxisPair;
}
export function resolveTouches(touches: readonly TouchInput[]): TouchInputState;
```

## Control/data flow
1. The wiring normalizes pointer events into points and feeds `resolveTouches` each frame.
2. The game consumes `actions` (207 dispatch), `move` (movement), and `lookDelta` (camera).

## Detailed behavior
- Zone table (7, vanilla-mobile-inspired rects), BUTTON zones first so they win where their
  rects overlap the half-screen zones:
  jump {0.62, 0.78, 0.18, 0.22} -> jump; sneak {0.14, 0.78, 0.18, 0.22} -> sneak; attack {0.9,
  0.62, 0.1, 0.2} -> attack; use {0.78, 0.62, 0.12, 0.2} -> use; inventory {0.86, 0.04, 0.14,
  0.12} -> inventory; move {0, 0, 0.5, 1}; look {0.5, 0, 0.5, 1}.
- `zoneAt(point)`: first zone containing the point (inclusive edges), else null.
- `dragVector`: per axis `applyDeadzone(clamp((current - start) * 4, -1, 1))`.
- `dragDelta`: per axis `current - start`.
- `resolveTouches`: for each touch: `zone = zoneAt(touch.point)`; null -> skip; button zone ->
  push its action (dedupe); move zone -> move = dragVector (last wins); look zone -> lookDelta =
  dragDelta (last wins); a move/look touch without `previous` uses its point as both start and
  current (zero vector/delta).

## Failure modes
- None — total functions.

## Compatibility/migration
- One new simulation file; 209/207 untouched; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- O(touches * zones) per resolve.

## Testing seams
- Tests drive `zoneAt` with boundary points (inclusive edges) and `resolveTouches` with
  hand-built touch lists.

## Observability/debugging
- `TouchInputState` is a plain immutable object; zone rects are exported constants.

## Affected files/symbols
- `src/simulation/TouchFramework.ts` (new).
- Tests: `tests/unit/TouchFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Pointer-event parsing in-module**: rejected — the module consumes already-normalized points,
  keeping it headless-testable.

## Downstream dependencies
- 211 (`internal-resource-pack-format`) organizes the touch HUD assets; the UI layer draws the
  zones; 242's e2e simulates touch input.
