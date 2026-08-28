# Proposal: 208-accessibility-options

## Problem
206's settings cover graphics/audio/controls/gameplay but not accessibility: no UI scale,
subtitles, reduced motion, screen-effect control, text background opacity, chat visibility, or
flash lighting. Accessibility needs its own typed, validated, persisted options.

## Goals
- `src/simulation/AccessibilityFramework.ts` (NEW), pure and headless-safe:
  - **Definitions**: the fixed `ACCESSIBILITY_OPTIONS` table of 7 typed options —
    `uiScale` (choice: `auto`/`small`/`normal`/`large`, default `auto`), `subtitles` (boolean,
    false), `reducedMotion` (boolean, false), `screenEffects` (choice: `fade`/`flash`/`none`,
    default `fade`), `textBackgroundOpacity` (float [0, 1], 0.5), `chatVisibility` (choice:
    `full`/`commands`/`hidden`, default `full`), `flashLighting` (boolean, true). Kinds: boolean /
    float (with inclusive range) / choice (with an options list).
  - **Store**: immutable `AccessibilityStore`; `createDefaultAccessibility()`; `getOption`;
    `setOption(store, key, value)` — invalid values (wrong kind, out of range, unknown choice) or
    same-value sets return the IDENTICAL store (identity no-op); `isValidAccessibilityValue` for
    pre-checks.
  - **Persistence**: `serializeAccessibility` / `deserializeAccessibility` — version 1,
    validate-before-accept: unknown keys and invalid values rejected, MISSING known options
    default (forward compatibility); descriptive throws.

## Non-goals
- **No UI rendering** (the UI layer applies the options), **no change to 206's settings**
  (accessibility is its own standalone, world-independent payload), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 207 (`keybinding-remap`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (206/207's persistence patterns are mirrored).

## Proposed change
1. `src/simulation/AccessibilityFramework.ts` (NEW): the option table, store, validation, and
   versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Choice drift**. Mitigation: every option's allowed values are pinned in tests; unknown
  choices are identity-no-op'ed and deserialization-rejected.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the option table (7 entries, kinds/ranges/choices/defaults); defaults;
  validation (boolean/float/choice, boundary values, unknown choices); set with identity no-ops;
  persistence round-trip; rejections (non-object, bad version, unknown option, wrong kind, out of
  range, unknown choice); missing-option defaults.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
