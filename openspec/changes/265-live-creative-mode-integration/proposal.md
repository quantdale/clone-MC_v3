# Proposal: 265-live-creative-mode-integration

## Problem

The verified `GameModeFramework` (192) is headless-only: it defines the canonical
mode set, immutable state, text entry, four behavior predicates (`canFly`,
`instantBlockBreak`, `depletesItems`, `survivalStatsDeplete`), and versioned
persistence — but the live `Game` never imports it (zero `GameMode` references
in `src/engine/Game.ts` / `src/player/*`; 192's verification records "no
`Game.ts` edit; no schema/save-format change"). Consequences in the shipped game:

- There is no way to enter creative mode: no UI toggle, no `/gamemode` application
  path (`CoreCommands` 191 is likewise headless-only; live has no command bar).
- Creative rules never apply: placing always consumes stacks, mining always takes
  duration, survival stats always drain, flight is impossible.
- The creative inventory/menu is an acknowledged future-work gap (`Game.ts`
  `testGrantAwkwardBottle` seam: "creative menu [is] future work"). Creative is
  therefore not playable despite C192 reading `exact`.

## Goals

1. Persist and restore the game mode through the world/player save path
   (`__gamemode__` raw record, degrade-to-defaults, reset/archive passthrough —
   261–264 precedent).
2. Provide switching seams: `Game.setGameMode(mode)` plus the 192 text entry
   `Game.setGameModeFromText(text)` (191 `/gamemode` parity without a chat UI),
   plus an in-game HUD mode toggle (Survival ⇄ Creative).
3. Apply the 192 predicates live on every switch with no restart:
   - `depletesItems() === false` → placing/using does not consume stacks;
   - `instantBlockBreak() === true` → creative mining completes instantly with
     vanilla no-drops/no-XP/no-tool-wear semantics;
   - `survivalStatsDeplete() === false` → survival tick and player-damage paths
     are gated (no hunger/damage drain);
   - `canFly() === true` → minimal safe flight (hover: no gravity; Space ascends,
     Shift descends) via a small `PlayerPhysics` hook plus a pure resolver.
4. Ship a creative inventory/menu UI: browse/search placeable blocks/items from
   the live registries and grant stacks into the inventory/hotbar with no
   survival crafting gates (one-container rule, HUD button + `KeyE` toggle,
   261–263 shell parity).
5. Keep survival the default and byte-for-byte unaffected (all hooks default to
   legacy behavior; mode defaults to `survival`).

## Non-goals

- Full spectator camera overhaul: 195 stays rule-level (spectator persists and
  inherits the shared no-deplete/no-stats/fly hooks, but noclip/no-interaction
  camera work is deferred).
- Hardcore (193) difficulty-lock/death-world wiring, unless a one-line shared
  hook falls out naturally (it does not — deferred).
- Adventure (194) break/place permission enforcement (held-item allow-lists need
  a UI that does not exist yet — deferred; adventure persists and inherits the
  shared depletion predicates).
- Multiplayer, chat/command UI, headed FPS work (258), reopening 259–264.

## Preconditions

- 192 `GameModeFramework` VERIFIED (predicates + serialization frozen).
- 191 `CoreCommands` / `parseGameMode` text entry available for the text seam.
- 261–264 persistence/shell/harness patterns established and green at
  `session_start_head c3ae6d16767e36c006e544d37cfdf751f41717a6`.
- 258 stays BLOCKED; 259–264 stay VERIFIED (override recorded in
  `CHANGE_SEQUENCE_OVERRIDES.md`).

## Dependencies

- `src/simulation/GameModeFramework.ts` (192, consumed read-only — no edits).
- `src/player/PlayerInteraction.ts` (place/break hooks), `src/player/PlayerPhysics.ts`
  (flight hook), `src/player/PlayerController.ts` (unchanged; input source only).
- `src/storage/WorldMetadataRepository.ts` + `GamePersistence.ts` + `WorldArchive.ts` +
  `WorldArchiver.ts` (new `__gamemode__` namespace + reset/archive passthrough).
- `src/engine/Game.ts`, `src/engine/InputManager.ts`, `index.html`, `src/styles.css`.
- `src/inventory/ItemRegistry.ts` + `src/world/BlockRegistry.ts` (menu catalog).

## Proposed change

A single narrow integration change (13 tasks):

1. **Persistence**: `__gamemode__:<worldId>` raw record; facade
   `initialGameMode` / `saveGameMode`; Game hydrate (injected + late-load) with
   degrade-to-survival; reset delete; archive optional passthrough.
2. **Switching**: `setGameMode` (typed, identity no-op) + `setGameModeFromText`
   (192 parse, invalid = false no-op) + HUD chip toggle; every switch persists.
3. **Live rules**: `PlayerInteraction` mode-rule callbacks (deplete/instant/drops,
   defaults = legacy); Game survival-tick gate + player-damage gate;
   `PlayerPhysics.isFlying` hook + pure `resolveCreativeFlightVelocity` resolver
   driven by Game each tick.
4. **Menu UI**: pure `listCreativeItems` / `searchCreativeItems` helpers over the
   live registries; `CreativeMenuPanel` DOM view (search + grant rows); Game
   `openCreative/closeCreative` with one-container discipline, HUD button, `KeyE`
   toggle, autosave/dispose/pagehide parity for the mode save.
5. **Tests**: unit (helpers, flight resolver, physics flying, interaction rules,
   persistence round-trip/quarantine) + 2 browser E2E (creative journey incl.
   reload-persistence; survival contrast + lifecycle).

## Compatibility and migration

- New record only; zero schema bumps, zero store changes. Absent/corrupt
  `__gamemode__` boots `survival` with a recorded facade error (never a crash).
- Archives v1/v2 without `gameModeData` import as null (= survival); export
  carries the payload when present. Reset deletes the key.
- All `PlayerInteraction`/`PlayerPhysics` hooks are optional callbacks defaulting
  to exact legacy behavior; headless/test callers without them see no change.

## Risks

- **Tick-order risk (flight vs gravity)**: mitigated by driving vertical velocity
  before `physics.update` and suppressing gravity inside it via predicate —
  covered by physics unit tests + E2E hover/rise assertions.
- **One-container tail**: every `openX`/tick-guard/dispose/respawn site must learn
  `creativeOpen`. Mitigated by grep-enumeration in T7 and the lifecycle E2E.
- **E2E 3D-action flakiness**: place/break assertions reuse the furnace-spec
  harness pattern (seams for setup, DOM/raycast for actions); generous polling.

## Rollback strategy

Revert the 265 commit range (single push). The save path degrades: unknown
`__gamemode__` records are inert without this code; no migration to unwind.

## Definition of Done

- Mode persists across reload; creative rules apply live on switch; creative
  menu grants stacks without survival gates; survival default and unaffected.
- Unit + build + lint + typecheck green; full E2E green (2 new specs);
  file-audit + validate-state green; PARITY_MATRIX C265 row `exact`.
- 258 still BLOCKED (untouched, not VERIFIED); 259–264 still VERIFIED.

## Advancement gate

Target 100% (13/13). Floor 90% only via an explicit Advancement Exception
proving every incomplete task non-blocking with no MUST/SHALL unverified.
Baseline gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run test:e2e`, plus `node scripts/validate-state.mjs` and the file audit.
