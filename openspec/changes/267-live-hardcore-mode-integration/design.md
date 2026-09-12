# Design: 267-live-hardcore-mode-integration

## Context/current state

- 193 `src/simulation/HardcoreFramework.ts`: immutable `HardcoreState
  { hardcore: boolean }`, `createDefaultHardcoreState()` (off),
  `setHardcore` (identity no-op on same value), `locksDifficulty` /
  `forcesPermanentDeath` (both `=== hardcore`), `effectiveDifficulty(state,
  level)` (`hard` when enabled, passthrough otherwise),
  `respawnModeAfterDeath(state, mode)` (`spectator` when enabled, passthrough
  otherwise), versioned `serialize/deserializeHardcoreState` (exact-keys,
  throws on violation). No live caller.
- 188 `src/simulation/WorldDifficulty.ts`: `DIFFICULTY_LEVELS`
  (peaceful/easy/normal/hard), `DEFAULT_DIFFICULTY = 'normal'`,
  per-level knob table, `parseDifficultyLevel` (trimmed case-insensitive,
  null for unknown), versioned `serialize/deserializeDifficulty`. No live
  caller — zero live consumers of any 188 accessor.
- 265/266 live wiring in `src/engine/Game.ts`: `gameMode: GameModeState`,
  `__gamemode__:<worldId>` persistence with degrade-to-survival,
  `setGameMode` / `setGameModeFromText` / `toggleGameMode`
  (survival⇄creative), chip + `#gamemode-select` sync, `saveGameMode()`
  (no-op when `recoveryRequiredValue` or no persistence),
  `onSurvivalEvent('death')` → `respawnPlayer()` (closes containers,
  teleports to spawn, `survival.consumeDeath()`, clears effects, toast
  `'You died. Respawned at spawn.'`). Mode is never touched by death.
- `tickWithers` calls `scaledWitherDuration(skull.kind, 'normal')` with a
  hardcoded `'normal'` (Game.ts); `scaledWitherDuration` is harder for
  `'hard'` than `'normal'` (252 table). Switching the argument to the
  effective difficulty is behavior-preserving for every default world.
- Persistence precedent (261–266): `WorldMetadataRepository` raw
  put/get pairs under reserved `__<name>__:<worldId>` keys (no
  `WorldMetadata` validation); `GamePersistence` `initialXValue` loaded with
  try/catch degrade, `saveX` guarded by `disposed || resetCompleted`,
  reset snapshot/restore + multi-store delete, `WorldArchive` optional field
  + `WorldArchiver` export/import passthrough.
- Settings UI: `#gamerule` dialog (`GameRulePanel` owns `#gamerule-rows`;
  `Game` owns open/close via HUD `#gamerule-open` + `KeyG`); HUD chips
  (`#gamemode-toggle`, `#gamemode-select`); `updateGameModeChip()` syncs
  chip + select. Worlds are seed-addressed; there is no creation screen.
- 245 precedent for E2E-only production seams (`testSetCameraPose`,
  `testFreezeDayNight`, `testNormalizeHud`): public `Game` methods used by
  browser E2E for deterministic control.

## Target state

Hardcore is a live world setting alongside the 265/266 mode wiring:

1. `__hardcore__` + `__difficulty__` persist per world (defaults off/normal),
   degrade-to-defaults on corrupt payloads, reset/archive passthrough.
2. `Game.getDifficulty()` is the single effective-difficulty reader
   (`effectiveDifficulty` over the live flag); `setDifficulty[FromText]` is a
   `false` no-op while hardcore is enabled (the lock).
3. Death routes through `respawnModeAfterDeath` + `setGameMode` (persisted,
   toasted) before the unchanged position reset. Hardcore death lands in
   spectator with all 266 spectator semantics (noclip, no-interact,
   no-targeting) live on the next tick; reload keeps hardcore + spectator.
4. The `#gamerule` dialog gains a world-settings section (hardcore toggle +
   difficulty select, select disabled while locked); the HUD gains a
   hardcore badge. `debugKillPlayer()` gives E2E deterministic deaths.

## Invariants

- I-1: Non-hardcore death/respawn is byte-for-byte today's behavior (same
  toast, same reset, mode untouched).
- I-2: Default worlds (no records) behave exactly as before this change:
  non-hardcore, configured normal ⇒ effective normal; wither duration
  argument `'normal'` equals `getDifficulty()`.
- I-3: Enabling hardcore never changes the current mode by itself; only
  death (or the explicit mode seams) change the mode.
- I-4: Denied difficulty edits under hardcore mutate nothing (no write, no
  toast, no UI drift — the select stays synced to the configured level).
- I-5: 193/188/252 modules are consumed read-only (no edits).
- I-6: 265 `__gamemode__` semantics, the chip toggle, and all 266 gates are
  unchanged.

## API and data model

```ts
// WorldMetadataRepository (additive, 265 precedent)
putHardcoreData(worldId: string, payload: unknown): Promise<void>;  // __hardcore__:worldId
getHardcoreData(worldId: string): Promise<unknown | null>;
putDifficultyData(worldId: string, payload: unknown): Promise<void>; // __difficulty__:worldId
getDifficultyData(worldId: string): Promise<unknown | null>;
// deleteRaw already covers both keys (comment update only).

// GamePersistence (additive, 265 precedent)
initialHardcoreValue: HardcoreState | null;      // getter initialHardcore
initialDifficultyValue: DifficultyLevel | null;  // getter initialDifficulty
saveHardcore(payload: unknown): void;            // disposed || resetCompleted ⇒ no-op
saveDifficulty(payload: unknown): void;          // same guard
// load: try deserializeHardcoreState/deserializeDifficulty → value; catch → null (degrade)
// reset: snapshot + restore + multi-store delete of both keys

// WorldArchive (additive optional fields, 265 precedent)
hardcoreData?: unknown | null;    // plain object; re-validated at load, absent ⇒ default
difficultyData?: unknown | null;  // plain object; re-validated at load, absent ⇒ default

// src/engine/Game.ts (wiring only + public seams)
private hardcore: HardcoreState;          // default createDefaultHardcoreState()
private difficulty: DifficultyLevel;      // configured; default DEFAULT_DIFFICULTY
isHardcore(): boolean;
setHardcore(enabled: boolean): boolean;   // identity ⇒ false; else apply + saveHardcore + UI sync + toast
getDifficulty(): DifficultyLevel;         // effectiveDifficulty(this.hardcore, this.difficulty)
getConfiguredDifficulty(): DifficultyLevel;
setDifficulty(level: DifficultyLevel): boolean;      // hardcore-locked ⇒ false; identity ⇒ false
setDifficultyFromText(text: string): boolean;        // parseDifficultyLevel; null/unknown ⇒ false
saveHardcore(): void; saveDifficulty(): void;        // persistence guards mirror saveGameMode
debugKillPlayer(): void;                  // E2E seam: survival.damage(1000, 'debug')
```

## Control/data flow

Boot: `GamePersistence.start()` loads both raw payloads (each in its own
try/catch; corrupt ⇒ null) → `Game` hydrates
`persistenceImpl?.initialHardcore ?? createDefaultHardcoreState()` and
`initialDifficulty ?? DEFAULT_DIFFICULTY` (same late-binding pattern as
`initialGameMode` when the impl resolves after construction).

Toggle: `#hardcore-toggle` click (or `setHardcore` seam) → `setHardcore`
applies the 193 identity rule → on change: persist, `updateWorldSettingsUI`,
toast (`Hardcore mode enabled — deaths are permanent.` /
`Hardcore mode disabled.`). Enabling mid-game keeps the live mode (I-3).

Difficulty edit: `#difficulty-select` change (or `setDifficultyFromText`) →
when `locksDifficulty(hardcore)`: `false`, status-surfaced refusal, select
re-synced. Otherwise 188 parse → identity ⇒ false; change ⇒ persist + sync.

Death: `onSurvivalEvent('death')` → `const after =
respawnModeAfterDeath(this.hardcore, this.gameMode.mode)` → `after !== mode`
implies `setGameMode(after)` (persist + chip/select sync + its toast) →
hardcore copy (`You died. Hardcore death — now spectating.`) vs normal copy
(unchanged) → `respawnPlayer()` (unchanged reset). Order matters: the mode
switch precedes the reset so the 266 spectator predicates are live for the
first post-death tick.

Wither: `scaledWitherDuration(skull.kind, 'normal')` →
`scaledWitherDuration(skull.kind, this.getDifficulty())`.

Reload: `pagehide` flush persists both records (via the existing autosave
path calling `saveHardcore`/`saveDifficulty` alongside `saveGameMode`);
boot rehydrates; E2E asserts flag + mode + effective difficulty.

## Detailed behavior

- `setHardcore(true)` on an already-hardcore world: `false`, no write, no
  toast (193 identity). Same for `false` on normal.
- `setDifficulty('hard')` while hardcore: `false` no-op even though the
  effective difficulty is already hard (the lock covers all four levels;
  configured level is preserved underneath).
- `setDifficultyFromText('  HARD ')` parses (188 trim/case rules); `''`,
  `'unknown'`, non-strings ⇒ `false`.
- Corrupt `__hardcore__` payload (wrong version, non-boolean, unknown key):
  caught at load ⇒ default off + `bootSaveDegraded`-style quarantine path
  (same shape as the 265 gamemode catch: value null, world boots). Same for
  `__difficulty__` ⇒ normal. Neither blocks boot.
- `debugKillPlayer()` in creative/spectator: `survival.damage` still applies
  (it is the raw system; the 265 `hurtPlayer` gate is bypassed
  deliberately — the seam is E2E-only, documented, and never called by
  production paths). Death event still routes through the hardcore rule.
- Difficulty select `disabled` attribute tracks `locksDifficulty`; the badge
  `#hardcore-badge` is hidden unless hardcore.
- Reset (`resetCurrentWorld`) deletes both keys (world returns to defaults);
  archive export includes both when present; import restores both when
  present (validated at load, never trusted blindly).

## Failure modes

- Unknown/extra keys, wrong versions, non-object payloads ⇒ load-time
  degrade to defaults (caught, world boots). Never throws to the caller.
- `saveHardcore`/`saveDifficulty` with no persistence or post-reset ⇒ silent
  no-op (265 `saveGameMode` precedent).
- Archive with malformed `hardcoreData`/`difficultyData` (non-object):
  `validateWorldArchive` throws before any write (F257-L atomicity); absent
  fields import as null ⇒ defaults.

## Compatibility/migration

- Zero schema changes (same metadata store, new reserved keys). Old saves
  boot as non-hardcore normal. No migration.
- Forward-created records are inert on older builds (no reader).
- Hardcore-death spectator `__gamemode__` records load as spectator on any
  265+ build.

## Performance/resource constraints

- No per-tick cost: the flag is read on death, toggle, and difficulty query
  (all edge-triggered); the wither call site already computed per skull hit.
  No new allocations in hot paths. Two extra metadata reads at boot, two
  extra debounced writes on toggle — negligible against the existing
  autosave budget.

## Testing seams

- Unit: repository put/get over the injectable mock factory (265 pattern);
  `GamePersistence` load-degrade + reset/archive passthrough over the same
  mock; composition matrix over 193+188 (lock × 4 levels, death × 4 modes,
  identity rules, serialize round-trips) without instantiating `Game`.
- E2E (`window.__voxelGame`): `isHardcore`, `setHardcore`,
  `getDifficulty`, `setDifficultyFromText`, `debugKillPlayer`,
  `getGameMode`, read-only world observation; world-settings section through
  real DOM clicks; reload through `pagehide` + `reload` (265 precedent).

## Observability/debugging

- `isHardcore()` + `getDifficulty()` expose the live state; toasts narrate
  toggle/lock-refusal/death; badge + select reflect the store (aria-live on
  the badge).
- No new logging; no new metrics.

## Affected files/symbols

- `src/storage/WorldMetadataRepository.ts`: +4 methods, `deleteRaw` comment.
- `src/storage/GamePersistence.ts`: +2 initial values/getters, +2 saves,
  load/reset/restore/delete wiring.
- `src/storage/WorldArchive.ts`: +2 optional fields + validation.
- `src/storage/WorldArchiver.ts`: export/import passthrough (+ report
  flags, 265 pattern).
- `src/engine/Game.ts`: fields, hydration, seams, death routing, wither
  argument, settings-section wiring, badge sync, `debugKillPlayer`.
- `index.html`: world-settings section in `#gamerule`
  (`#hardcore-toggle`, `#difficulty-select`), `#hardcore-badge` in HUD.
- `src/styles.css`: section/badge placement (266 select precedent).
- `tests/unit/HardcorePersistence.test.ts` (new) + composition suite
  `tests/unit/HardcoreModeIntegration.test.ts` (new).
- NEW `tests/e2e/hardcore-mode.spec.ts` (2 tests).
- `PARITY_MATRIX.md` C267 row; program state files.

## Rejected alternatives

- Single combined `__hardcore__` record carrying difficulty: rejected —
  193's exact-keys validator forbids extra keys, and one-record-per-feature
  is the 261–266 precedent (independent reset/audit).
- Locking `setGameMode` out of spectator while hardcore: rejected — vanilla
  hardcore locks difficulty, not operator mode commands; the standing order
  requires only that *normal respawn* cannot return the player to survival
  (the death path owns the mode, `respawnPlayer` never restores it).
- Wiring all 188 knobs (spawn gate, damage/hunger multipliers, starvation):
  rejected for this change — each alters default-world behavior surfaces
  (e.g. peaceful spawns) needing its own balance contract; the wither
  call site proves the lock end-to-end with zero default-world delta.
- World-creation-screen enable: rejected — no creation screen exists
  (seed-addressed worlds); the gamerule-adjacent settings toggle is the
  order-authorized seam.

## Downstream dependencies

None: 267 is a leaf live-integration (no later change consumes its seams
except future difficulty-knob wiring, which is out of scope).
