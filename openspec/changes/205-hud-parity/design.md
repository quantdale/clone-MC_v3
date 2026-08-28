# Design: 205-hud-parity

## Context/current state
- The HUD renders from ad-hoc player state; there is no deterministic icon projection. 205 adds
  the pure `projectHud` contract; the HUD layer draws `HudState`, and 206's settings follow.

## Target state
- `src/ui/HudParity.ts` holding `HudInputs`, `HudState`, and the total, clamping `projectHud`.

## Invariants
- Pure and headless-safe: no DOM access, no mutation of inputs, no throws (total function).
- All numeric projections clamp: hearts/hunger/armor to their maxima, air to [0, 10],
  experience progress to [0, 1], selected slot to [0, 8], boss-bar progress to [0, 1].
- Hearts/hunger/armor use the half-icon convention: `full = floor(v/2)`, `half = v % 2 === 1`.
- Air bubbles use `ceil(air / maxAir * 10)` (10 bubbles at full air, one per 1/10th consumed).
- Effect `remainingFraction = clamp(durationTicks / 600, 0, 1)`; `blinking = durationTicks < 200`
  (the ~10-second warning window at 20 tps).

## API and data model
```ts
// src/ui/HudParity.ts (new)
export interface HudStatusEffect {
  id: string;
  amplifier: number;
  durationTicks: number;
}
export interface HudBossBar { id: string; progress: number; color: string; }

export interface HudInputs {
  health: number;
  maxHealth: number;
  hunger: number;
  saturation: number;
  armorPoints: number;
  airLevel: number;
  maxAir: number;
  experienceLevel: number;
  experienceProgress: number;
  statusEffects: readonly HudStatusEffect[];
  selectedSlot: number;
  bossBars: readonly HudBossBar[];
}

export interface HudBars { full: number; half: boolean; }
export interface HudState {
  hearts: HudBars;
  hunger: HudBars;
  armor: HudBars;
  airBubbles: number;
  experience: { level: number; progress: number };
  effects: readonly { id: string; amplifier: number; durationTicks: number; remainingFraction: number; blinking: boolean }[];
  selectedSlot: number;
  bossBars: readonly HudBossBar[];
}

export function projectHud(inputs: HudInputs): HudState;
```

## Control/data flow
1. Each frame the wiring snapshots the player systems into `HudInputs`.
2. `projectHud` projects it; the HUD layer draws the resulting `HudState`.

## Detailed behavior
- `bars(v, max)`: `clamped = clamp(v, 0, max)`; `{ full: floor(clamped / 2), half: clamped % 2 ===
  1 }`.
- hearts = bars(health, maxHealth); hunger = bars(hunger, 20); armor = bars(armorPoints, 20).
- airBubbles = clamp(ceil((airLevel / maxAir) * 10), 0, 10); maxAir <= 0 -> 0 bubbles.
- experience: `{ level: max(0, floor(experienceLevel)), progress: clamp(experienceProgress, 0, 1) }`.
- effects: map passthrough with `remainingFraction: clamp(durationTicks / 600, 0, 1)` and
  `blinking: durationTicks < 200`.
- selectedSlot = clamp(round(selectedSlot), 0, 8) (non-finite -> 0).
- bossBars: map with `progress: clamp(progress, 0, 1)`; empty list stays empty.

## Failure modes
- None — a total function; every input is clamped, never thrown on.

## Compatibility/migration
- One new ui file; player systems and registries untouched; no `Game.ts` edit; no schema/save-
  format change.

## Performance/resource constraints
- O(status effects + boss bars); constant per frame otherwise.

## Testing seams
- Tests drive `projectHud` with exact boundary values (19 hp, 20 hp, 1 hp; air 0/1/30/31/300;
  effect durations 0/199/200/600/601).

## Observability/debugging
- `HudState` is a plain immutable object; every field is inspectable.

## Affected files/symbols
- `src/ui/HudParity.ts` (new).
- Tests: `tests/unit/HudParity.test.ts` (new). No other files.

## Rejected alternatives
- **Binding directly to player classes**: rejected — a plain snapshot decouples the HUD from
  system internals and keeps the projection headless-testable.

## Downstream dependencies
- The HUD renderer draws `HudState`; 206 (`settings-persistence`) follows; 242's e2e asserts HUD
  states.
