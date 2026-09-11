# Proposal: 261-gamerule-settings-ui

## Problem

The typed gamerule registry (`src/simulation/GameRuleFramework.ts`, change 189,
VERIFIED) is headless-only: no in-game surface exists to view or edit the nine
registered rules, gamerules are not persisted with the world, and live
simulation paths that already accept a gamerule flag never receive one. In
particular `PARITY_MATRIX.md` records on C252/MP-19.4-1 that the
"mobGriefing=false destroyable-filter seam [is] present but not yet wired to a
gamerule UI toggle": `WitherBoss.shouldWitherDestroyBlock` /
`witherExplosionWorld` take `mobGriefing`, but `Game.applyWitherExplosion`
destroys blocks unconditionally. Players cannot observe or change any rule
without code.

## Goals

- Ship an accessible in-game settings/gamerule UI over the existing 189
  registry: view and edit every registered rule (boolean/integer/string kinds)
  with framework validation (invalid input = identity no-op, surfaced as a
  status message, never a throw or a partial write).
- Persist gamerules with the world save path already used by the game
  (IndexedDB metadata store raw namespace, wither-data precedent from 252), so
  rules survive unload/reload; corrupt payloads fall back to defaults without
  breaking boot.
- Wire `mobGriefing` into the live Wither/destroyable path
  (`Game.applyWitherExplosion` via the existing `witherExplosionWorld` seam),
  closing the C252/MP-19.4-1 "seam not wired to UI" debt.
- Wire the other 189 keys that already have a production consumer, without
  inventing simulation systems: `doFireTick` (skip Fire `onRandomTick`
  dispatch) and `randomTickSpeed` (count override at the existing
  `RandomTickSelector` call site), both default-preserving.
- Prove the loop with unit tests plus a browser E2E journey:
  open → toggle `mobGriefing` → persist → reload → effect observable
  (explosion spares blocks; contrast run destroys them).
- Original assets only (`.html`/`.css`/`.ts`, no binaries).

## Non-goals

- Multiplayer gamerule replication or server-authoritative rule sync (222–237
  own the transport; no 261 codec or message changes).
- Change-258 headed FPS certification (258 stays BLOCKED; no headed work, no
  GPU evidence, 258 is never marked VERIFIED by this track).
- Reopening 259 or 260 (both stay VERIFIED unless a gamerule regression blocks
  this player loop).
- Redesigning the 189 rule registry (keys, kinds, defaults, and validation
  semantics are fixed; the UI renders whatever `gameRuleDefinitions()`
  returns).
- A `/gamerule` text command: the command layer (190/191) exists, but
  single-player `Game` has no live command-execution path — `ChatCommandRouter`
  effects are produced for the multiplayer server path and never applied by
  `Game`. Adding an unapplied command would be dead surface, so 261 is
  UI-only; the rationale is recorded in design.md.
- New simulation systems for rules with no production consumer
  (`doWeatherCycle`: `Game` holds no `WeatherState` and never calls
  `tickWeather`; `doDaylightCycle`, `doMobSpawning`, `keepInventory`,
  `doImmediateRespawn`, `spawnRadius`: no `Game` consumer reads them). These
  rules remain view/edit/persist through the UI with an explicit documented
  no-consumer rationale, not silent omission.

## Preconditions

- `origin/main` at session start `60eb9ba0023bcb9e9a89846c4c697c775305ce1e`
  (fetched; local HEAD equals remote).
- Change 258 BLOCKED at 40/100 (headed hardware-WebGL deferred by owner);
  changes 259 (18/18) and 260 (19/19) VERIFIED.
- 261 authorized as the sole ACTIVE implementation change by the standing owner
  order and `CHANGE_SEQUENCE_OVERRIDES.md`.

## Dependencies

- 189 `GameRuleFramework` (registry, validation, parse, versioned serde).
- 252 wither seam (`shouldWitherDestroyBlock`, `witherExplosionWorld`,
  `computeExplosion` via 169 ExplosionCore) and the 252 persistence precedent
  (raw `__wither__:<worldId>` metadata namespace + `GamePersistence`
  bulk-load/save + reset deletion + `WorldArchive`/`WorldArchiver`
  passthrough).
- 128 `FireBlockBehavior` + 048/050 random-tick dispatch in
  `Game.tickRandomBlocks` (existing consumer for `doFireTick` /
  `randomTickSpeed`).
- 259/260 panel + shell + lifecycle patterns (`EnchantingPanel`,
  `BrewingPanel`, `index.html` dialog blocks, `InputManager` toggle queue).

## Proposed change

1. Persistence: `WorldMetadataRepository.getGameRuleData/putGameRuleData`
   under `__gamerules__:<worldId>`; `GamePersistence` bulk-loads into
   `initialGameRules` (validated via `deserializeGameRules`, corrupt → defaults
   + recorded error), `saveGameRules(payload)` fire-and-forget write,
   reset-path deletion, and `WorldArchive`/`WorldArchiver` optional
   `gameruleData` passthrough (missing → null, backward compatible).
2. `Game` owns a `GameRuleStore` (init from persistence or defaults):
   `getGameRules()` / `setGameRule(key, value)` (framework identity no-op on
   invalid; valid edits persist + re-render); `mobGriefing` gates block
   destruction in `applyWitherExplosion` via `witherExplosionWorld` (entity
   damage unchanged); `doFireTick === false` skips Fire `onRandomTick`
   dispatch; `randomTickSpeed` overrides the selector count (clamped ≥ 0,
   default 3 = today's behavior exactly).
3. `src/ui/GameRulePanel.ts`: pure view over `Game` getters (no owned rule
   state), accessible dialog (boolean toggles `aria-pressed`, labeled
   number/text inputs, status line, close button). Opened by `G`
   (`InputManager` queued toggle mirroring `KeyC`) and a HUD button; closed by
   `G`, `C` (one-container rule), close button, death, and `dispose()`.
4. Shell: `index.html` `#gamerule` dialog block + `src/styles.css`
   `gamerule-*` styles (additive only).
5. Tests: `GameRulePanel` unit (FakeElement harness), `GameRulesPersistence`
   unit (round-trip, corrupt fallback, reset deletion, archive passthrough),
   wiring unit (`witherExplosionWorld` gating + selector-count resolution),
   `tests/e2e/gamerule.spec.ts` journey (open → toggle → persist → reload →
   observable explosion contrast) + lifecycle (toggle/close/blur/death-safe).

## Compatibility and migration

- New raw record: old saves simply have no `__gamerules__` key and boot with
  defaults (forward-compatible by absence). Corrupt payloads degrade to
  defaults with a recorded persistence error; boot never throws.
- `WorldArchive` gains an OPTIONAL `gameruleData` field (v1 and v2 archives
  without it import as null); export writes it when present.
- No registry, block/item, worldgen, or network format changes. No 189
  semantics changes. Default rule values reproduce today's behavior exactly
  (`mobGriefing` true, `doFireTick` true, `randomTickSpeed` 3).

## Risks

- E2E flakiness on shared runners (mitigate with the 259/260 harness shape:
  single worker, seeded world, deterministic explosion assertions, no timing
  dependence).
- Scope creep into unwired rules (mitigate: explicit no-consumer list with
  rationale; any newly discovered consumer is documented, not silently wired).
- Accidental 207 keybinding-table churn (mitigate: `G` is a hardcoded
  `InputManager` queue like `KeyC`, not a new remappable action).

## Rollback strategy

Revert the 261 commit range on `origin/main` (normal history-preserving
revert). Persistence is additive (a dormant raw record); pre-261 builds ignore
it. No migration to unwind.

## Definition of Done

- Every registered gamerule is viewable and editable in-game with validation;
  invalid input is a status-surfaced no-op.
- Rules persist across pagehide + reload; corrupt store degrades to defaults.
- `mobGriefing=false` spares blocks in `applyWitherExplosion` (player damage
  unchanged); `=true` destroys as before.
- `doFireTick=false` skips Fire random ticks; `randomTickSpeed` N drives the
  selector count; defaults reproduce current behavior.
- Unit + browser E2E journey green; full baseline gates green
  (typecheck/lint/unit/build/e2e); `validate-state` PASS; C261 matrix row
  exact; 261 VERIFIED and published to `origin/main`.

## Advancement gate

100% tasks (T1–T18) plus all MUST/SHALL verified and all required gates green.
Floor 90% only via an explicit Advancement Exception proving every incomplete
task is non-blocking and implements/verifies no MUST/SHALL; no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
258 is not VERIFIED by this track under any circumstance.
