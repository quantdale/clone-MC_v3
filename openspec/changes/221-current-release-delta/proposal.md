# Proposal: 221-current-release-delta

## Problem
215-220 expanded content as data against the baseline architecture. Current-release behavior
and content must be isolatable WITHOUT destabilizing that baseline: a declaration layer that
says which expanded content a release enables and which behaviors it overrides.

## Goals
- `src/data/ReleaseDelta.ts` (NEW), pure and headless-safe:
  - **Model**: `ReleaseDelta { release, content?, behavior? }` — `release` a non-empty string
    (e.g. `1.21`); `content` maps the content kinds from 215-220 (`blocks`, `items`, `biomes`,
    `mobs`, `structures`, `enchantments`, `effects`, `potions`, `recipes`, `loot`) to lists of
    non-empty content ids (default: absent kinds are empty); `behavior` a list of
    `BehaviorOverride { target, field, value }` (non-empty target/field; value a boolean,
    finite number, or string).
  - **Queries**: `contentForKind(delta, kind)` (registration order); `isEnabled(delta, kind,
    id)`; `overridesFor(delta, target)` (registration order) — the pure overlay surface the
    runtime applies; the baseline architecture is never touched.

## Non-goals
- **No baseline mutation** (the delta is a declaration the runtime overlays), **no version
  comparison**, **no runtime behavior wiring**, **no change to 215-220**, **no `Game.ts`
  edit**, **no save-format change**.

## Preconditions
- Change 220 (`recipe-loot-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (the content kinds are referenced as strings, decoupled
  from 215-220's modules).

## Proposed change
1. `src/data/ReleaseDelta.ts` (NEW): the delta model, validation, and the overlay queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Kind-name drift from 215-220**. Mitigation: the ten kind names are pinned as exported
  constants and validated; unknown kinds throw.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid deltas (defaults + explicit, all ten kinds); every rejection;
  contentForKind/isEnabled; overridesFor; empty delta; immutability.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
