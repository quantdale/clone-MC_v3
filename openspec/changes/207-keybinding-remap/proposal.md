# Proposal: 207-keybinding-remap

## Problem
206 defined settings but controls are fixed: no remappable keybindings, no conflict handling, no
keybinding persistence. The options UI and input wiring need a pure keybinding model.

## Goals
- `src/simulation/KeybindingFramework.ts` (NEW), pure and headless-safe:
  - **Action table**: the fixed `KEYBINDING_ACTIONS` of 23 original actions with default keys —
    movement (forward `KeyW`, back `KeyS`, left `KeyA`, right `KeyD`, jump `Space`, sneak
    `ShiftLeft`, sprint `ControlLeft`), interaction (attack `MouseLeft`, use `MouseRight`,
    pickBlock `MouseMiddle`), inventory (`KeyE`, drop `KeyQ`, swapOffhand `KeyF`, chat `KeyT`),
    and hotbar 1-9 (`Digit1`-`Digit9`); `defaultKey(action)` lookup.
  - **State**: immutable `KeybindingState { bindings }`; `createDefaultKeybindings()`; `keyFor`;
    `actionForKey` (the first action bound to a key, or null).
  - **Conflict-aware remap**: `remapKey(state, action, key)` — an invalid (empty/whitespace) key
    returns `{ ok: false, reason: 'invalid_key' }`; a key already bound to the SAME action is an
    identity no-op (`{ ok: true, state, displaced: null }`); a key bound to ANOTHER action
    SWAPS — the displaced action receives the remapped action's previous key (vanilla);
    otherwise the action rebinds. Every success reports the displaced action.
  - **Reset**: `resetKey(state, action)` (back to default) and `resetAll(state)` (defaults).
  - **Persistence**: `serializeKeybindings` / `deserializeKeybindings` — version 1,
    validate-before-accept: unknown actions rejected, invalid (empty) keys rejected, MISSING
    actions default (forward compatibility); descriptive throws.

## Non-goals
- **No input capture/DOM events** (the wiring maps pressed keys through `actionForKey`), **no
  options UI**, **no change to 206's settings** (keybindings are their own standalone payload,
  world-independent like settings), **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 206 (`settings-persistence`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (206's persistence pattern is mirrored).

## Proposed change
1. `src/simulation/KeybindingFramework.ts` (NEW): the action table, state, conflict-aware remap,
   reset, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Swap-semantics drift**. Mitigation: the swap rule (displaced action receives the remapped
  action's PREVIOUS key) is pinned in tests including self-rebind identity and cross-action
  swaps.
- **Persistence drift**. Mitigation: unknown/invalid rejections and missing-action defaults are
  pinned with exact messages.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the action table (23 entries, defaults, lookup); defaults; keyFor/
  actionForKey (incl. null); remap (fresh key, same-action identity, cross-action swap, invalid
  key rejection, displaced reporting); resetKey/resetAll; persistence round-trip and every
  rejection (non-object, bad version, unknown action, invalid key, non-object bindings);
  missing-action defaults.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
