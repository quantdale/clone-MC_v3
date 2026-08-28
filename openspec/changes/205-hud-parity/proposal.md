# Proposal: 205-hud-parity

## Problem
The HUD has no data contract: nothing projects health, hunger, armor, air, XP, status effects,
selection, or boss bars into the icon states the UI draws. 206's settings and the existing HUD
renderer need a deterministic projection.

## Goals
- `src/ui/HudParity.ts` (NEW), pure and headless-safe (no DOM access, no mutation, no throws):
  - **Projection**: `projectHud(inputs)` — takes a plain `HudInputs` snapshot of the player
    systems and returns an immutable `HudState`:
    - **Hearts** (10 icons): `{ full, half }` from health/2 (1 hp = half a heart), clamped to
      `maxHealth`.
    - **Hunger** (10 shanks): `{ full, half }` from hunger/2 on the 0-20 scale.
    - **Armor** (10 icons): `{ full, half }` from armorPoints/2, clamped to 20.
    - **Air** (10 bubbles): `ceil(air / maxAir * 10)`, clamped to [0, 10].
    - **Experience**: `{ level, progress }` — integer level passthrough, progress clamped to
      [0, 1].
    - **Status effects**: passthrough with `remainingFraction = clamp(durationTicks / 600, 0,
      1)` and `blinking = durationTicks < 200` (vanilla's ~10-second warning window at 20 tps).
    - **Selected slot**: clamped to [0, 8].
    - **Boss bars**: passthrough with `progress` clamped to [0, 1].

## Non-goals
- **No HUD rendering/CSS** (the existing HUD layer draws `HudState`), **no input collection**
  (the wiring snapshots the systems), **no change to player systems**, **no `Game.ts` edit**,
  **no save-format change**.

## Preconditions
- Change 204 (`recipe-book`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (inputs are a plain snapshot, decoupled from the systems).

## Proposed change
1. `src/ui/HudParity.ts` (NEW): `HudInputs`, `HudState`, and the total `projectHud` projection.

## Compatibility and migration
- One new ui file; zero changes to player systems or registries; no `Game.ts` edit; no schema/
  save-format change.

## Risks
- **Icon rounding drift from vanilla**. Mitigation: every conversion (hearts/hunger/armor halves,
  air bubbles via ceil, effect blink threshold) is pinned at its exact boundaries in tests.

## Rollback strategy
One new ui file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: hearts (full/half/max clamp/negative clamp); hunger shanks; armor icons;
  air bubbles at ceil boundaries (0, 1, 30, 31, 300); experience (level passthrough, progress
  clamps); effects (fraction clamps, blinking threshold 199/200); selected slot clamp; boss bars
  (progress clamp, passthrough, empty list); totals on malformed inputs.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
