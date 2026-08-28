# Spec: touch-framework

## Contract
This capability adds the pure touch input model: normalized touch zones (movement, look, and five
action buttons over 207's actions), hit testing, drag math for movement/look, and touch-to-
action resolution — headless-safe (the wiring feeds normalized points).

## Definitions
- **Zone**: a normalized (0..1) rect with an id; button zones carry the action they trigger.
- **Drag vector**: `deadzone(clamp((current - start) * 4, -1, 1))` per axis (full deflection at a
  quarter of the screen).
- **Look delta**: the raw `current - start` offset.

## Invariants
- Pure and headless-safe: no pointer capture, no mutation of inputs, no throws.
- `zoneAt` MUST return the FIRST matching zone in table order (inclusive edges) or null.
- `resolveTouches` MUST dedupe button actions, MUST use the LAST move/look touch, and MUST treat
  a move/look touch without `previous` as a zero drag.

## Requirements

### Requirement: zone table and hit test
`TOUCH_ZONES` MUST contain exactly the 7 zones (jump, sneak, attack, use, inventory — the button
zones FIRST — then move and look) with the documented normalized rects; button zones MUST carry
their 207 action. `zoneAt(point)` MUST return the first zone containing the point (inclusive
edges) or null; the button-first order makes buttons win where their rects overlap the half-
screen zones.

#### Scenario: hit test
- **GIVEN** points (0.25, 0.5), (0.75, 0.5), (0.65, 0.85), (0.18, 0.9), (0.95, 0.7), (0.9,
  0.08), (1, 0), (2, 2), and (0.8, 0.7)
- **THEN** the zones are move, look, jump, sneak, attack, inventory, look (edge), null, and use
  (the use rect {0.78, 0.62, 0.12, 0.2} contains the point; jump's rect starts at y = 0.78)

### Requirement: drag math
`dragVector(drag)` MUST return the deadzoned, clamped scaled offset per axis; `dragDelta(drag)`
MUST return the raw offset.

#### Scenario: drags
- **GIVEN** a move drag from (0.3, 0.5) to (0.4, 0.5) — delta (0.1, 0) -> scaled (0.4, 0);
  a drag to (0.6, 0.5) — delta (0.3, 0) -> scaled (1.2, 0) clamped to (1, 0); a drag to
  (0.3125, 0.5) — delta (0.0125, 0) -> scaled (0.05, 0) deadzoned to (0, 0)
- **THEN** the vectors are (0.4, 0), (1, 0), (0, 0); `dragDelta` of the first is (0.1, 0)

### Requirement: touch resolution
`resolveTouches(touches)` MUST map touches to `{ actions, move, lookDelta }`: button touches
push their actions (deduped), move touches set the move vector (last wins), look touches set the
look delta (last wins); touches outside every zone and empty lists contribute nothing.

#### Scenario: resolution
- **GIVEN** a jump touch at (0.65, 0.85), a use touch at (0.85, 0.7), another jump touch at
  (0.7, 0.85), a move touch (0.3, 0.5) -> (0.4, 0.5), a look touch (0.6, 0.5) -> (0.8, 0.5),
  a touch at (2, 2), and an empty list
- **THEN** the actions are `['jump', 'use']` (deduped, last jump ignored); move is (0.4, 0);
  lookDelta is (0.2, 0); the out-of-zone touch and the empty list yield no changes (empty
  resolution: `{ actions: [], move: (0, 0), lookDelta: (0, 0) }`)

## Error and failure behavior
- None — total functions over normalized inputs.

## Performance and resource bounds
- O(touches * zones) per resolve.

## Compatibility and migration
- One new simulation file; 209/207 untouched; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; raw touch lists are never mutated.

## Observability
- `TouchInputState` is a plain immutable object; zone rects are exported constants.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 zones/hit test | `tests/unit/TouchFramework.test.ts` › zones |
| REQ-2 drag math | › drags |
| REQ-3 resolution | › resolution |
