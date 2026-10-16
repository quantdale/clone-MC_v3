# Proposal: 206-settings-persistence

## Problem
The game has no settings model: no typed graphics/audio/control/gameplay settings, no
validation, no persistence contract independent of world saves. 207's keybinding remap needs the
settings framework, and the options UI needs a store.

## Goals
- `src/simulation/SettingsFramework.ts` (NEW), pure and headless-safe:
  - **Definitions**: the fixed table `SETTING_DEFINITIONS` of 10 typed settings across four
    categories — graphics (`renderDistance` integer 2-32 default 12, `fov` integer 30-110 default
    70, `brightness` float 0-1 default 0.5), audio (`masterVolume`/`musicVolume`/`sfxVolume`
    floats 0-1 default 1), controls (`mouseSensitivity` float 0.1-2 default 0.5, `invertY`
    boolean default false), gameplay (`autoJump` boolean default true, `showCoordinates` boolean
    default false). Kinds: boolean / integer (with range) / float (with range).
  - **Store**: immutable `SettingsStore`; `createDefaultSettings()`; `getSetting`;
    `setSetting(store, key, value)` — invalid values (wrong kind, out of range) or same-value
    sets return the IDENTICAL store (identity no-op); `isValidSettingValue` for pre-checks.
  - **Persistence**: `serializeSettings` / `deserializeSettings` — version 1, validate-before-
    accept: unknown keys rejected, invalid values rejected, MISSING known keys default (forward
    compatibility when new settings are added); descriptive throws.

## Non-goals
- **No storage layer** (the wiring stores the serialized payload under a settings key,
  independent of world saves — the independence is a storage seam, not in-module state), **no
  options UI**, **no keybinding remap** (207), **no `Game.ts` edit**, **no world-save-format
  change**.

## Preconditions
- Change 205 (`hud-parity`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (189's gamerule pattern is mirrored, extended with ranges).

## Proposed change
1. `src/simulation/SettingsFramework.ts` (NEW): the definitions, store, validation, and versioned
   persistence.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no world-save-format change.

## Risks
- **Range drift**. Mitigation: every definition's kind/min/max is pinned in tests, and
  out-of-range values are identity-no-op'ed and deserialization-rejected.
- **Forward compatibility**. Mitigation: missing keys default instead of failing, so future
  settings additions never break old payloads.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the definition table (10 entries, kinds/ranges/defaults); defaults; set with
  validation (boolean/integer/float, boundary values, out-of-range identity no-ops, same-value
  identity); persistence round-trip; rejections (non-object, bad version, unknown key, wrong
  kind, out-of-range value); missing-key defaults.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
