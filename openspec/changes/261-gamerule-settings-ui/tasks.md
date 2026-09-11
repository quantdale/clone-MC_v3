# Tasks: 261-gamerule-settings-ui

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Furnace (251) / enchanting (259) / brewing (260)
panel, shell, lifecycle, and harness patterns are mirrored, never forked.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 261 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=261-gamerule-settings-ui ACTIVE; 258 recorded BLOCKED; 259
  and 260 recorded VERIFIED; nextExactAction = T2). Evidence:
  `git diff` of the four files.
- [x] **T2.** Quality-gate the package: PASS 2026-09-11 — number/name matches sequence; 258-BLOCKED/259-260-VERIFIED exception owner-authorized; proposal 11/11, design 14/14, spec 19 MUST/SHALL with scenarios; no normative placeholders; `node scripts/validate-state.mjs` PASS at session_start_head 60eb9ba. number/name matches CHANGE_SEQUENCE.md
  row; previous-change exception explicitly owner-authorized (258 stays
  BLOCKED per CHANGE_SEQUENCE_OVERRIDES.md, 259/260 stay VERIFIED; no headed
  work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Persistence (TDD: injected IndexedDB factory + capturing asserts)

- [x] **T3.** `WorldMetadataRepository` gamerule raw namespace +
  `GamePersistence` load/save/reset + archive passthrough: 0 new stores, 0
  version bumps. `getGameRuleData/putGameRuleData` (`__gamerules__:<worldId>`
  raw record, wither precedent); `GamePersistence.open()` bulk-load beside
  the 252 hydration (null → absent; non-null → `deserializeGameRules` in
  try/catch → defaults + recorded error); `initialGameRules` getter +
  `saveGameRules(payload)` fire-and-forget with recorded errors; 257 reset
  path deletes the raw key; `WorldArchive.gameruleData` OPTIONAL
  (missing → null) + `WorldArchiver` export/import passthrough. New
  `tests/unit/GameRulesPersistence.test.ts` (round-trip save→flush→reopen,
  absent → null/defaults, 4 corrupt shapes → defaults + error recorded,
  reset deletes, archive v1/v2-without-field import as null, export carries).
  Evidence: suite green; existing storage suites untouched-green.

## C. Game store + live-consumer wiring (narrowest validation per site)

- [x] **T4.** `Game` gamerule store: `gameRules` field init from validated
  `persistenceImpl.initialGameRules` else `createDefaultGameRules()`;
  `getGameRules()` / `setGameRule(key, value)` (unknown/wrong-kind → false +
  IDENTICAL store; valid → new store + `saveGameRules(serialize…)` +
  `true`); pure `resolveRandomTickCount(store)` helper (clamp `>= 0`).
  Typecheck PASS + new wiring unit pins (defaults, invalid no-op identity,
  count clamp edges). Evidence: typecheck + focused unit green.
- [x] **T5.** `mobGriefing` wiring (closes C252/MP-19.4-1 UI debt):
  `applyWitherExplosion` wraps its local world with
  `witherExplosionWorld(base, mobGriefing)`; player blast damage untouched;
  single choke point covers spawn-blast + skull-hit blasts. New
  `tests/unit/GameRuleWiring.test.ts` pins (false → zero destroyed via the
  helper, true → destroys, protected ids still spared when true).
  Evidence: suite green.
- [x] **T6.** `doFireTick` + `randomTickSpeed` wiring (default-preserving):
  `tickRandomBlocks` skips Fire `onRandomTick` when `doFireTick === false`
  (fire key resolved once via `blockRegistry.get(BlockId.Fire).key`) and
  passes `resolveRandomTickCount(gameRules)` as the selector count (default 3
  = today's call exactly). Unit pins count resolution (3/0/7/negative-clamp);
  dispatch gating pinned by inspection + deterministic harness (T12/T13 use
  the live paths). Evidence: unit green; no other tick behavior changed.

## D. Panel (TDD: FakeElement shim, node env)

- [x] **T7.** `src/ui/GameRulePanel.ts` skeleton + render: fail-fast
  `Gamerule element missing`; show/hide/isVisible; one row per
  `gameRuleDefinitions()` (boolean `<button aria-pressed>`, integer
  `<input type=number>`, string `<input type=text>`); status line
  `aria-live=polite`; signature-gated render; panel owns no rule state. New
  `tests/unit/GameRulePanel.test.ts` FakeElement harness (construction +
  missing-id + show/hide + 9 rows in registry order + boolean toggle calls
  `setRule` + invalid integer keeps value + status strings + zero-write
  second render). Evidence: suite green.

## E. Game wiring + shell (mirror 259/260)

- [x] **T8.** `InputManager` `KeyG` queue + `Game` gamerule session
  lifecycle: `gameruleToggleQueued`/`consumeGameruleToggle` (queued on
  `KeyG`, cleared on blur/unlock, preventDefault-listed); `openGamerule()` /
  `closeGamerule()` / `isGameruleOpen()`; opening closes
  crafting/furnace/brewing/enchanting first (one-container rule) with
  lock/overlay handling; `C`-toggle closes instead of stacking; pointer
  relock closes; blur/visibility keep without stacking; death
  (`respawnPlayer`) + `dispose()` close. Typecheck PASS + panel/wiring suites
  green (behavioral evidence: T13/T14).
- [x] **T9.** Shell: `index.html` `#gamerule` dialog block (title, status,
  rows container, close) + HUD `#gamerule-open` button + `src/styles.css`
  `gamerule-*` styles (259/260-mirrored); additions are .html/.css/.ts only
  (no binaries; `git status` check). `npm run build` PASS. Evidence: build
  output.

## F. Browser E2E (journey + lifecycle)

- [x] **T10.** `tests/e2e/gamerule.spec.ts` journey (closes MP-19.4-1 UI
  debt): boot → press `G` (panel opens, 9 rows, defaults) → real-click
  `mobGriefing` toggle off (aria-pressed false + status) → invalid integer
  no-op (`randomTickSpeed` `abc` keeps 3 + status) → deterministic explosion
  contrast on a stone platform via `applyWitherExplosion` (false → all
  survive; true → some destroyed) → pagehide+reload → field-for-field
  persist (`mobGriefing` still false, platform state intact). Evidence: spec
  passes headed.
- [x] **T11.** Lifecycle E2E: `G` toggles closed; `C` closes with overlay
  return; HUD button opens; blur keeps panel unstacked; death-safe close
  where the harness can reach it without headed-only input. Evidence: spec
  passes headed.

## G. Regression + gate + handoff

- [x] **T12.** MP-19.4-1 debt closure + matrix note: post-terminal gamerule note added (no C261 row until VERIFIED); 189/191/207/252/128/196/259/260 files untouched (`git status` confirms — touch set is Game/InputManager/storage/shell/panel/tests only); file-audit manifest extended with 10 new-file rows + `validate-file-audit.mjs` PASSED (2694 rows). `PARITY_MATRIX.md`
  post-terminal gamerule note (no C261 row until VERIFIED, per C259/C260
  precedent); 189/191/207/252/128/196/259/260 verification files untouched
  (`git status` confirms); file-audit manifest extended with new-file rows +
  `validate-file-audit.mjs` PASS.
- [x] **T13.** Full regression: `npm run typecheck` PASS; `npm run lint` 0 errors (85 pre-existing warnings); `npm test` 403 files / 4803 passed + 1 skipped (new: GameRulePanel 7, GameRulesPersistence 12, GameRuleWiring 5; updated: WorldArchiver report literal +gameruleDataImported); `npm run build` PASS (2.23s); file-audit PASS (2694 rows); `validate-state` PASS. `npm run typecheck` PASS; `npm run lint` 0
  errors (85 pre-existing warnings); `npm test` (new: GameRulePanel,
  GameRulesPersistence, GameRuleWiring; characterization updates only where
  pinned-behavior-preserving); `npm run build` PASS; file-audit PASS;
  `validate-state` PASS. Evidence: exact outputs in verification.md.
- [x] **T14.** Full E2E: `npm run test:e2e` 69/69 PASS (27.3m, single worker) incl. 3 gamerule specs (journey + damage-independence + lifecycle); zero regressions; `test-results/.last-run.json` {"status":"passed","failedTests":[]}. Slow files memory-stress 14.6m / visual 6.6m as before; no flakes requiring isolation. `npm run test:e2e` PASS incl. 2 gamerule specs
  (journey + lifecycle); zero regressions;
  `test-results/.last-run.json` `{"status":"passed","failedTests":[]}`.
- [x] **T15.** Reconciliation + state: artifacts re-read vs implementation,
  drift fixed; C261 matrix row exact + summary counts + note flipped to
  VERIFIED; `PROGRAM_STATE.json`/`.md` checkpoint (18/18 100% when all
  checked, heads recorded, 258 BLOCKED blocker kept); `validate-state` PASS.
- [x] **T16.** Publish: committed as `111ad94`, pushed to `origin/main`, remote head verified (`111ad94`), localHead sync residual `640c032` pushed, remote==local verified; final report below. 258 NOT marked VERIFIED; no headed FPS work; 259/260 NOT reopened. Do NOT mark 258 VERIFIED;
  do NOT touch headed FPS work; do NOT reopen 259/260. commit, push to `origin/main`, remote head verified,
  `published_head` recorded; final report (SHAs, status, completion,
  validations, blockers, next action). Do NOT mark 258 VERIFIED; do NOT
  touch headed FPS work; do NOT reopen 259/260.
