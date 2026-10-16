# Proposal: 203-container-screen-framework

## Problem
106 owns transactional menu state and 202 owns screen interactions, but nothing binds them into a
reusable screen: no event reducer, no validated screen state, no hotbar selection. Every UI would
otherwise re-implement the wiring.

## Goals
- `src/inventory/ContainerScreenFramework.ts` (NEW), pure and headless-safe:
  - **Screen state**: `ContainerScreenState { menu, drag, selectedHotbar }` —
    `createContainerScreen(menu)` (drag inactive, hotbar 0) and
    `validateContainerScreen(input)` (106's menu validation + drag shape + hotbar in [0, 8];
    descriptive throws).
  - **Event reducer**: `applyScreenEvent(state, event)` over a typed `ContainerScreenEvent`
    union: `click` (left/right -> 106's transactions), `dragStart` / `dragHover` / `dragEnd`
    (202's drag), `doubleClick` (202's gather), `quickMove` (shift-click -> 106), `hotbarSwap`
    (202), and `selectHotbar` (0..8). Invalid indices throw descriptively; identity no-ops are
    preserved from the underlying modules.
  - **Reusable**: the reducer is menu-agnostic (player inventory, chest, furnace — any validated
    `ContainerMenu`).

## Non-goals
- **No DOM/canvas UI rendering** (the UI layer renders the state), **no input capture/pointer
  events**, **no persistence** (screens are transient), **no change to 106/202**, **no `Game.ts`
  edit**, **no save-format change**.

## Preconditions
- Change 202 (`inventory-screen-parity`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 106's `ContainerMenu` / `applyMenuTransaction` / `validateContainerMenu` and 202's drag/gather/
  swap functions (imported; both modules untouched).

## Proposed change
1. `src/inventory/ContainerScreenFramework.ts` (NEW): the screen state, validation, and the event
   reducer.

## Compatibility and migration
- One new inventory file; zero changes to 106/202 or any registry; no `Game.ts` edit; no schema/
  save-format change.

## Risks
- **Event/error drift**. Mitigation: every event type's happy path and every throw path (out-of-
  bounds click, invalid drag index, non-hotbar swap, bad hotbar selection, malformed screen
  state) is pinned in tests.
- **Index safety before 202's dragEnd**. Mitigation: the reducer validates drag indices at
  `dragStart`/`dragHover` (202's `dragEnd` is then only fed valid indices).

## Rollback strategy
One new inventory file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: default screen creation; every event type (click both buttons, drag full
  flow, double-click, quickMove, hotbarSwap, selectHotbar incl. identity); a composed pickup-
  drag-drop flow; invalid event throws (out-of-bounds click/drag index, non-hotbar swap, hotbar
  selection out of range); `validateContainerScreen` accept + every rejection; input immutability.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
