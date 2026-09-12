# Proposal: 271-statistics-panel-ui

## Problem

The verified headless `StatisticsFramework` (187) — typed counters, event
hooks, `statisticsSnapshot` UI projection, versioned persistence — has no
live wiring. Real gameplay (walking, breaking blocks, killing the wither,
dying, taking damage, jumping, playing time) accrues nothing, nothing is
persisted with the world save, and the player has no in-game surface to see
their statistics. This is the meta-progression UI debt parallel to what
263 closed for advancements.

## Goals

- Persist one world-scoped statistic store with the world/player save path
  (`__statistics__` raw metadata record, versioned
  serialize/deserialize, degrade-to-defaults, reset/archive passthrough).
- Live-increment counters from real gameplay events at existing clean hooks:
  walk distance, blocks broken, mob kills (wither defeat — the only live
  player-kill path), deaths, damage taken, jumps, time played (`play_tick`
  on the fixed tick).
- Ship an in-game statistics panel (hotkey `KeyH` + HUD button,
  one-container rule) listing `statisticsSnapshot` values with readable
  labels, re-rendering while open.
- Prove with unit tests (view, panel, persistence, wiring seams) plus
  browser E2E: play actions bump stats → panel shows them → reload persists.
- Original assets only (text/DOM/CSS, no copied art).

## Non-goals

- Multiplayer per-player stores (single local store only).
- Redesigning the 187 key set (`DEFAULT_STATISTIC_KEYS` unchanged).
- 258 headed FPS certification (no headed work, no GPU evidence).
- Full Java-Edition statistics categories (custom/data-mined/general tabs
  beyond the 7 framework keys).
- Reopening 259–270 (untouched unless a statistics regression blocks 271).

## Preconditions

- 258 stays **BLOCKED** (40/100, headed hardware-WebGL deferred by owner).
- 259–270 stand **VERIFIED** (270 VERIFIED 12/12 at `e049e88`, checkpoint
  `0774975` = session start).
- 271 is the sole ACTIVE implementation change per
  `CHANGE_SEQUENCE_OVERRIDES.md`.

## Dependencies

- 187 `src/simulation/StatisticsFramework.ts` (store, events, snapshot,
  persistence pair) — consumed verbatim, not modified.
- 263 panel precedent (`AdvancementPanel`, open/close/lifecycle/persistence
  patterns in `src/engine/Game.ts`).
- 267 persistence precedent (`__hardcore__`/`__difficulty__` metadata,
  autosave/pagehide/dispose/reset/archive sites).
- 265/266 mode predicates (`survivalStatsDeplete`, `canFly`,
  `canInteract`) for hook gating decisions.

## Proposed change

1. `src/simulation/StatisticsView.ts` (new, pure): `describeStatistics`
   rows in catalog order with readable labels and value formatting
   (meters for walk, human duration for time played, integers else).
2. `src/ui/StatisticsPanel.ts` (new, DOM controller): pure view over
   Game-owned store, signature-cached render, `data-statistic-row`
   attributes, status line, close delegation — the 263 shape.
3. Persistence: `__statistics__` through `WorldMetadataRepository`
   get/put, `GamePersistence` save/load/reset, `WorldArchiver`/`WorldArchive`
   passthrough; boot degrade-to-defaults.
4. Game store: `statistics: StatisticStore` + `recordStatistic(event)`
   seam (identity → early return; else save-policy + render-if-open) +
   `getStatisticsSnapshot`/`listStatisticRows` observability.
5. Event hooks (all existing sites, no new systems):
   - `onInteractionAction('break')` → `break_block`.
   - `onSurvivalEvent('damage'/'death')` → `damage`/`death` (covers all
     applied damage incl. DoT; respects existing mode gates upstream).
   - Wither-defeat reward sites (3, each `!hasDroppedReward`-guarded) →
     `kill_mob`.
   - `runFixedTick` → `play_tick` + on-ground horizontal displacement →
     `walk`.
   - `PlayerController` optional `onJump` opt (both impulse sites) → `jump`.
6. Shell: `#statistics` dialog + `#statistics-open` HUD button in
   `index.html`, styles in `src/styles.css`, `KeyH` toggle in
   `InputManager` + Game, one-container/blur/death/dispose lifecycle,
   live re-render while open.
7. Save policy: 5s autosave + pagehide/dispose flush + explicit save on
   death and on panel close (NOT every tick — `play_tick`/`walk` update
   every tick; writes stay bounded).
8. Tests: unit (view, panel, persistence, wiring seams, jump hook,
   edge/failure) + 2 browser E2E (journey + lifecycle).

## Compatibility and migration

- New record key; absent → defaults (fresh zeros). Corrupt/unknown-key
  payloads → quarantine to defaults + `recordError` (never partial accept;
  the 187 deserializer already throws with exact reasons).
- `STATISTICS_VERSION` stays 1; format changes need a new change + migration.
- Reset deletes `__statistics__`; archive carries it like its siblings.

## Risks

- Per-tick dirty writes (mitigated: bounded save policy, §7 above).
- Swim-up jump spam (held-space in water fires per-tick impulses;
  documented semantic: each upward impulse counts; no controller
  edge-tracking added).
- Mob-kill coverage limited to wither (no live regular-mob kill path
  exists — `HostileMobBaseline` has no player-attack/death; documented,
  future change owns it).
- Walk counts on-ground horizontal displacement only (fly/swim excluded;
  documented simplification, no JE category parity claimed).

## Rollback strategy

Revert the 271 commits; saves keep an inert `__statistics__` record that
older code ignores (unknown-key tolerant read path is additive-only).

## Definition of Done

- All 14 tasks `[x]` with evidence; every MUST/SHALL verified.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` green; `validate-state` PASS; file-audit clean.
- `PARITY_MATRIX.md` C271 row exact; PROGRAM_STATE 271 VERIFIED.
- Published to `origin/main`; final report with SHAs.

## Advancement gate

100% tasks (floor 90% only via explicit Advancement Exception proving
non-blocking + no MUST/SHALL gap). 258 MUST NOT be marked VERIFIED; no
headed work; 259–270 stay VERIFIED.
