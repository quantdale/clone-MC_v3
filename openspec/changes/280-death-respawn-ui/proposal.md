# Proposal: 280-death-respawn-ui

## Problem

The live game already performs deterministic death handling: `SurvivalSystem`
emits death, normal worlds respawn immediately through the existing safe spawn
and bed-spawn path, and hardcore worlds become spectator. The player only sees
a short toast, however. There is no durable-in-session visual record of why
the player died or whether the outcome was a respawn or permanent-death
spectator transition.

## Goals

- Carry the existing damage reason through the death event without changing
  health, invulnerability, armor, hardcore, bed, or respawn rules.
- Map known reasons to readable labels and unknown/malformed values to a
  safe generic label.
- Show a dismissible death card with cause and outcome for normal and hardcore
  deaths, using original DOM/CSS and no raster asset.
- Keep the card under the existing one-container/input lifecycle and prove
  it through units plus a real browser journey.

## Non-goals

- No deferred or user-gated respawn; existing normal death remains synchronous.
- No new death simulation, damage types, hardcore/bed semantics, death-screen
  persistence, multiplayer death protocol, or item-loss/economy behavior.
- No visual-golden re-pin, headed FPS/GPU work, or Change 258 activity.

## Preconditions

- Changes 259–279 are VERIFIED and Change 258 remains BLOCKED.
- `SurvivalSystem`, `HardcoreFramework`, `SleepFramework`, the safe spawn path,
  and the existing panel/toast/HUD shell are live and tested.
- All existing callers of `SurvivalSystem.damage` remain valid when the event
  callback gains an optional reason.

## Dependencies

- `src/player/SurvivalSystem.ts` death event and existing damage reason.
- `src/engine/Game.ts` `onSurvivalEvent`, `respawnPlayer`, hardcore/bed stores,
  and one-container close helpers.
- Existing `ui`/HUD DOM and CSS conventions, Playwright E2E seams, and the
  267/274 death regression tests.

## Proposed change

Add `DeathRespawnPresentation` pure helpers that normalize a damage reason to
one of the readable causes (`Fall`, `Drowning`, `Lava`, `Starvation`,
`Wither`, `Debug damage`, `Damage`, or `Unknown damage`) and create an
outcome view for `respawned` or `spectating`. Extend the existing survival
event callback with an optional reason only; no serialized shape changes.

Add a small `DeathRespawnPanel` bound to `#death-screen`. `Game` opens it
immediately after the existing `respawnPlayer()`/hardcore mode routing, so the
underlying state transition remains unchanged. A `Continue`/`Continue
spectating` button dismisses the card idempotently. The card is pointer-passive
outside its button, and pointer lock or any existing panel opening dismisses
it before gameplay input resumes.

## Compatibility and migration

The callback reason is optional and all existing event listeners remain valid.
The panel is transient and never enters `GamePersistence`, `PlayerStateRecord`,
world archives, or any new namespace. Reload always starts with the card
hidden. Existing normal/hardcore/bed death behavior and toasts remain intact.

## Risks

- A new overlay could block an existing panel or pointer-lock path; the
  one-container and pointer-passive rules plus lifecycle E2E pin this down.
- A malformed reason could leak internal text; the pure normalizer uses a
  closed mapping and generic fallback.
- A death event could be emitted before the DOM shell exists; Game updates are
  null-safe and the card is initialized before the live loop can damage the
  player.

## Rollback strategy

Revert the 280 commit. The optional event argument is source-compatible, and
the additive hidden DOM/CSS and pure module have no storage migration.

## Definition of Done

- All package tasks and MUST/SHALL scenarios are complete at 100%.
- Normal and hardcore death outcomes expose a cause/outcome card without
  changing existing respawn semantics.
- Unit, browser, regression, typecheck, lint, full unit, build, file-audit,
  state validation, and parity evidence are recorded.
- 280 is committed and published to `origin/main`; 258 remains BLOCKED.

## Advancement gate

Advance only at 100% (10/10), with all required tests green and no unresolved
data-loss, lifecycle, compatibility, determinism, security, or regression
blocker.
