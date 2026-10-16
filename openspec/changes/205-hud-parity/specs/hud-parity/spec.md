# Spec: hud-parity

## Contract
This capability adds the pure HUD projection: `projectHud(inputs)` maps a snapshot of the player
systems (health, hunger, armor, air, XP, status effects, selection, boss bars) into the exact
icon states the HUD draws — a total, clamping, headless-safe function.

## Definitions
- **Bars**: `{ full, half }` — the whole/half icon counts (1 hp = half an icon).
- **Air bubbles**: 10 icons at full air, one consumed per tenth.
- **Blinking effect**: `durationTicks < 200` (the ~10-second warning window at 20 tps).

## Invariants
- Pure and headless-safe: no DOM access, no mutation, no throws (total).
- Every projection clamps: hearts/hunger/armor to their maxima, air to [0, 10], XP progress to
  [0, 1], selected slot to [0, 8], boss-bar progress to [0, 1].
- Hearts/hunger/armor: `full = floor(v/2)`, `half = v % 2 === 1`.
- Air: `ceil(air / maxAir * 10)`; `maxAir <= 0` yields 0.

## Requirements

### Requirement: health, hunger, and armor bars
`projectHud` MUST project health into hearts (`full = floor(health/2)`, `half` on odd values),
hunger into shanks on the 0-20 scale, and armorPoints into icons on the 0-20 scale, all clamped
to their maxima.

#### Scenario: bars
- **GIVEN** health 19 / max 20, hunger 13, armorPoints 17, health 21, and health -1
- **THEN** hearts are `{ full: 9, half: true }`; hunger `{ full: 6, half: true }`; armor
  `{ full: 8, half: true }`; health 21 clamps to `{ full: 10, half: false }`; health -1 clamps to
  `{ full: 0, half: false }`

### Requirement: air bubbles
`projectHud` MUST project air to `ceil(air / maxAir * 10)` clamped to [0, 10]; `maxAir <= 0`
MUST yield 0 bubbles.

#### Scenario: air
- **GIVEN** (air, maxAir) pairs (300, 300), (31, 300), (30, 300), (1, 300), (0, 300), (10, 0)
- **THEN** the bubbles are 10, 2, 1, 1, 0, 0

### Requirement: experience
`projectHud` MUST pass the integer level (non-negative) and clamp progress to [0, 1].

#### Scenario: experience
- **GIVEN** level 5 progress 0.5, level 5 progress 1.5, and level -2 progress -0.2
- **THEN** the results are `{ level: 5, progress: 0.5 }`, `{ level: 5, progress: 1 }`, and
  `{ level: 0, progress: 0 }`

### Requirement: status effects
`projectHud` MUST pass effects through with `remainingFraction = clamp(durationTicks / 600, 0,
1)` and `blinking = durationTicks < 200`.

#### Scenario: effects
- **GIVEN** durations 0, 199, 200, 600, 601
- **THEN** the fractions are 0, 0.3316..., 1/3, 1, 1 and blinking is true, true, false, false,
  false respectively; an empty list stays empty

### Requirement: selection and boss bars
`projectHud` MUST clamp the selected slot to [0, 8] and every boss-bar progress to [0, 1].

#### Scenario: selection and bars
- **GIVEN** selectedSlot 8, selectedSlot -1, selectedSlot 9.6, and boss bars with progress 0.4,
  -0.5, 2, and an empty boss-bar list
- **THEN** the selections are 8, 0, 8 and the boss-bar progresses are 0.4, 0, 1; the empty list
  stays empty

## Error and failure behavior
- None — a total function; every input is clamped, never thrown on.

## Performance and resource bounds
- O(status effects + boss bars) per call; constant otherwise.

## Compatibility and migration
- One new ui file; player systems and registries untouched; no `Game.ts` edit; no schema/save-
  format change.

## Security and integrity
- Pure projection; no side effects, no mutable shared state.

## Observability
- `HudState` is a plain immutable object; every field is inspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 bars | `tests/unit/HudParity.test.ts` › bars |
| REQ-2 air | › air |
| REQ-3 experience | › experience |
| REQ-4 effects | › effects |
| REQ-5 selection/boss bars | › selection and boss bars |
