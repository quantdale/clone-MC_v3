# Proposal: 267-live-hardcore-mode-integration

## Problem

Change 193 (`HardcoreFramework`) verified the pure headless predicates for
hardcore mode — the immutable hardcore flag, the difficulty lock
(`effectiveDifficulty` always `hard` when enabled), and death-world semantics
(`respawnModeAfterDeath` always `spectator` when enabled) — and changes
265/266 wired game modes (survival/creative/adventure/spectator) into the live
Game. As shipped, hardcore has **no live semantics**:

- no `__hardcore__` world record exists; every world behaves non-hardcore;
- the configured difficulty is not stored anywhere live (188 is headless-only:
  zero live consumers), so there is nothing to lock;
- death always runs the same `respawnPlayer()` position reset and the player
  keeps their mode — a hardcore death respawns in survival;
- no UI can enable hardcore for a world (default off is unspecified in code);
- the one live difficulty-relevant call (`scaledWitherDuration(skull.kind,
  'normal')` in `Game.tickWithers`) hardcodes `'normal'`.

## Goals

1. Persistence: world-scoped `__hardcore__` (+ `__difficulty__`) records with
   degrade-to-defaults quarantine and reset/archive passthrough, following the
   261–266 raw-metadata precedent. Default: hardcore off, difficulty normal.
2. Difficulty lock: `getDifficulty()` returns
   `effectiveDifficulty(hardcore, configured)` — always `hard` when hardcore is
   enabled; the configured level verbatim otherwise. Changing the configured
   difficulty while hardcore is enabled is a `false` no-op (locked).
3. Permanent death: on the survival `death` event, route the mode through
   `respawnModeAfterDeath` (existing 266 `setGameMode` path, persisted) and
   then run the unchanged position reset. Hardcore death ⇒ spectator;
   non-hardcore death ⇒ mode unchanged (today's behavior byte-for-byte).
4. Settings UI: a hardcore toggle + difficulty select in the gamerule-adjacent
   settings UI (`#gamerule` dialog world-settings section; difficulty select
   disabled while hardcore is locked) plus a HUD hardcore badge. Original
   assets only; no new simulation systems; no headed-GPU work.
5. Proof: unit + browser E2E — enable hardcore → die → spectator-locked with
   hard difficulty → reload persists hardcore + spectator; a normal world still
   respawns in survival.

## Non-goals

- Deleting the world save on death (vanilla offers spectate-or-delete; this
  change ships spectate-lock, matching the standing order's preference).
- Multiplayer behavior (222–237 arcs own the network boundary).
- Full 188 knob wiring (hostile-spawn gate, mob-damage/hunger multipliers,
  starvation gate): only the wither-duration call site is switched to the
  effective difficulty; the remaining knobs are documented future wiring, not
  built here.
- 258 headed FPS certification (stays BLOCKED; untouched).
- A world-creation screen: worlds are seed-addressed (`world-${seed}`); the
  gamerule-adjacent settings toggle is the enable seam (explicitly allowed by
  the standing order).
- A chat UI for difficulty commands (191 parity stays text-seam based; the
  difficulty seam is `setDifficultyFromText`, mirroring `setGameModeFromText`).

## Preconditions

- 193 VERIFIED (pure predicates, unchanged by this change).
- 188 VERIFIED (pure difficulty table + persistence pair, unchanged).
- 259–266 VERIFIED (this change extends their seams without altering them).
- 258 BLOCKED (no headed work in this change).

## Dependencies

- `src/simulation/HardcoreFramework.ts` (193): `effectiveDifficulty`,
  `respawnModeAfterDeath`, `serialize/deserializeHardcoreState` — consumed,
  not modified.
- `src/simulation/WorldDifficulty.ts` (188): `DEFAULT_DIFFICULTY`,
  `parseDifficultyLevel`, `serialize/deserializeDifficulty` — consumed, not
  modified.
- `src/simulation/WitherSkull.ts` (252): `scaledWitherDuration` — consumed,
  not modified (call site switches its hardcoded `'normal'` argument to the
  effective difficulty).
- `src/engine/Game.ts` 265/266 wiring (`gameMode`, `setGameMode`,
  `saveGameMode`, `respawnPlayer`, `onSurvivalEvent`, gamerule dialog, HUD
  chips) — extended, not altered.
- `src/storage/*` 261–266 raw-metadata precedent (`__gamerules__`,
  `__gamemode__`, …) — extended with two records.

## Proposed change

1. **Persistence**: `WorldMetadataRepository.put/getHardcoreData` +
   `put/getDifficultyData` (`__hardcore__:` / `__difficulty__:` keys);
   `GamePersistence` `initialHardcoreValue` / `initialDifficultyValue`,
   `saveHardcore` / `saveDifficulty`, degrade-to-default load, reset
   snapshot/restore + delete, `resetCompleted`/disposed guards;
   `WorldArchive` optional `hardcoreData` / `difficultyData` + `WorldArchiver`
   export/import passthrough.
2. **Live store**: `Game` fields `hardcore: HardcoreState` (default off) +
   `difficulty: DifficultyLevel` (configured, default normal); seams
   `isHardcore`, `setHardcore`, `getDifficulty` (effective),
   `setDifficulty` / `setDifficultyFromText` (locked under hardcore),
   `saveHardcore` / `saveDifficulty`; boot hydration from persistence.
3. **Death**: `onSurvivalEvent('death')` computes
   `respawnModeAfterDeath` and applies a mode change through `setGameMode`
   when it differs, then the unchanged `respawnPlayer()` reset. Hardcore
   toast names permanent death; normal toast unchanged.
4. **Difficulty consumer**: `tickWithers` passes `this.getDifficulty()` to
   `scaledWitherDuration` (identical for default normal worlds, hard under
   hardcore).
5. **UI**: world-settings section in `#gamerule` (`#hardcore-toggle`,
   `#difficulty-select`), HUD `#hardcore-badge`, `debugKillPlayer` E2E seam
   (245 hook precedent).
6. **Tests**: persistence round-trip + degrade + reset/archive unit suites;
   store/lock/death composition unit suite; two new browser E2E specs reusing
   the 265 harness shape (seams + real DOM + `pagehide` reload).

## Compatibility and migration

- New records only; old saves without them boot as non-hardcore normal
  (the specified defaults). No migration needed.
- Reset deletes both records (world returns to defaults); archives carry
  them as optional fields (absent ⇒ defaults on import).
- Saves authored by this build load on older builds with the records inert
  (unknown keys are namespaced raw payloads, never parsed by old code).

## Risks

- E2E flakiness under software WebGL: reuse the 265 harness (pointer lock,
  seeded world, `pagehide` reload); death is driven by the deterministic
  `debugKillPlayer` seam, not by gameplay damage races.
- `setHardcore` mid-game toggle: allowed (settings seam), applies
  immediately, persists; enabling hardcore does not change the current mode
  until death (documented in design.md).
- Toast text on hardcore death must not be confused with the normal respawn
  toast (distinct copy, asserted in E2E).

## Rollback strategy

Revert the 267 commit range; `__hardcore__` / `__difficulty__` records are
inert without this code (raw payloads no reader parses). `__gamemode__`
spectator records written by hardcore deaths remain valid modes on older
builds (all four modes already persist since 265/266).

## Definition of Done

- All 13 tasks checked with evidence; every MUST/SHALL requirement maps to a
  passing test; baseline gates green (`typecheck`, `lint`, `test`, `build`,
  `test:e2e`); `PARITY_MATRIX.md` C267 row `exact`; 258 still BLOCKED (not
  VERIFIED); 259–266 still VERIFIED.

## Advancement gate

Standard gate: 100% tasks (floor 90% only with an explicit non-blocking
exception), all MUST/SHALL verified, required tests green, no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
