# Tasks: 271-statistics-panel-ui

- [x] 1. `StatisticsView` pure rows — implement
  `src/simulation/StatisticsView.ts` (`describeStatistics` catalog order,
  7 labels, value formatting: meters/duration/integers) + unit tests
  (`tests/unit/StatisticsView.test.ts`: order, labels, format edges
  incl. 0, 59/60/61 ticks, 3599/3600 ticks, float flooring).
- [x] 2. `StatisticsPanel` DOM controller — implement
  `src/ui/StatisticsPanel.ts` (263 shape: `listRows`/`onClose` deps,
  show/hide, status line, signature-cached render,
  `data-statistic-row`, fail-fast missing ids) + unit tests over the
  FakeElement node-shim pattern (skeleton, 7 rows, badge-free values,
  cache no-churn, close delegation).
- [x] 3. Persistence path — `WorldMetadataRepository.put/getStatisticData`
  (`__statistics__`), `GamePersistence.saveStatistics` + load degrade
  (absent→null→defaults; corrupt→null+`recordError`) + reset delete +
  `WorldArchiver`/`WorldArchive` passthrough + unit tests
  (`tests/unit/StatisticsPersistence.test.ts`: round-trip, 4 rejection
  classes, reset, archive).
- [x] 4. Game store seam — `statistics` field, boot hydrate (validated or
  defaults + late-promise re-render parity), `recordStatistic` (identity
  early-return; else dirty + render-if-open), `saveStatistics` (no-op when
  recovery/disposed), `getStatisticsSnapshot`/`listStatisticRows`
  observability; seam-level unit tests (`StatisticsWiring`: identity refs,
  copy semantics, no-throw edges).
- [x] 5. Event wiring I (discrete) — `break_block` in
  `onInteractionAction('break')`; `damage`/`death` (+ immediate save on
  death) in `onSurvivalEvent`; `kill_mob` inside the 3 wither-defeat
  `!hasDroppedReward` guards; seam tests (exactly-once, undefined-amount
  no-op, creative-break counts documented).
- [x] 6. Event wiring II (tick + jump) — `play_tick` + on-ground
  horizontal `walk` accumulation in `runFixedTick` (baseline init +
  teleport/respawn reset); `PlayerController` optional `onJump` opt fired
  at both impulse sites + Game wiring; unit tests (jump both sites,
  swim-hold semantic pinned, teleport-no-meters, paused-tick N/A by
  construction).
- [x] 7. Shell + hotkey — `index.html` `#statistics` dialog +
  `#statistics-open` HUD button; `src/styles.css` panel styles (263
  advancement/gamerule classes as visual precedent, original CSS);
  `InputManager` `KeyH` queue + `consumeStatisticToggle` + preventDefault.
- [x] 8. Panel lifecycle in Game — `openStatistics`/`closeStatistics`/
  `isStatisticsOpen` + one-container both directions (all open-sites +
  `respawnPlayer`/dispose/`simulationActive` gate) + `KeyH` toggle next to
  gamerule + HUD wiring + live re-render while open (advancements slot) +
  status-line counts.
- [x] 9. Browser E2E journey — `tests/e2e/statistics.spec.ts`: fresh world,
  `H` opens 7 labeled rows; walk/break/jump actions bump values in the
  open panel; `pagehide` + reload preserves field-for-field (hardcore
  76-80 settle pattern); death via `debugKillPlayer` bumps `deaths` and
  persists.
- [x] 10. Browser E2E lifecycle — close via `H`, Escape-equivalent, blur,
  one-container vs crafting, no-double-toggle, HUD-button open parity.
- [x] 11. Edge/failure validation — corrupt + unknown-key + negative +
  non-integer payloads boot-to-zeros; reset clears; archive carries;
  disposed toggle/save no-ops; suite-green proof recorded.
- [x] 12. Full baseline gate — `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`, `npm run test:e2e` all green with exact
  counts; no 259–270 regressions; no 258 headed work.
- [x] 13. Matrix + checkpoint — `PARITY_MATRIX.md` C271 exact row;
  `tasks.md`/`verification.md` evidence-synced;
  `openspec/PROGRAM_STATE.json`/`.md` checkpoint (271 VERIFIED 14/14,
  258 BLOCKED intact); `validate-state` PASS; file-audit clean.
- [x] 14. Publish + VERIFIED — commit, push `origin/main`, verify remote
  head, record `published_head`, flip `verification.md` to VERIFIED with
  the advancement-gate computation, final session report with SHAs.
