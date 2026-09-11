# Tasks: 265-live-creative-mode-integration

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Gamerule (261) / recipe-book (262) / advancement
(263) / item-XP (264) persistence, shell, and harness patterns are mirrored,
never forked.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: (DONE 2026-09-11; `validate-state` PASS) override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 265 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=265-live-creative-mode-integration ACTIVE 0/13; 258
  recorded BLOCKED; 259/260/261/262/263/264 recorded VERIFIED; nextExactAction =
  T2). Evidence: `git diff` of the four files + `validate-state` PASS.
- [x] **T2.** Quality-gate the package: (DONE 2026-09-11 — PASS: number/name matches sequence; 258 BLOCKED exception owner-authorized in overrides, 259–264 VERIFIED untouched; proposal 11/11, design 14/14, spec MUST/SHALL + scenarios; tasks cover unit/edge/regression/docs/gate; verification maps requirements; baseline gate declared; `validate-state` PASS) number/name matches sequence;
  previous-change exception explicitly owner-authorized (258 stays BLOCKED
  per CHANGE_SEQUENCE_OVERRIDES.md, 259–264 stay VERIFIED; no
  headed work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Pure helpers (TDD: no DOM, no Game)

- [x] **T3.** `src/simulation/CreativeInventory.ts` (DONE 2026-09-11; 18/18 green: 10 inventory + 8 flight) + `src/player/CreativeFlight.ts`
  with unit suites (192 consumed read-only, never edited):
  `listCreativeItems` (placeable-only, registration order, unresolvable rid →
  `blockId: null` row kept), `searchCreativeItems` (blank = all, trim + lowercase
  substring over name/key, order stable), `resolveCreativeFlightVelocity`
  (non-fly modes → `{flying:false}` with velocity ignored; fly modes →
  jump/sneak/hover mapping at `CREATIVE_FLY_SPEED`). New
  `tests/unit/CreativeInventory.test.ts` + `tests/unit/CreativeFlight.test.ts`
  (≥10 cases each incl. empty-registry, whitespace-query, both-keys, NaN-guard
  on ignored velocity). Evidence: suites green.

## C. Persistence (TDD: injected IndexedDB factory + capturing asserts)

- [x] **T4.** `WorldMetadataRepository` raw namespace (DONE 2026-09-11; 16/16 green + WorldArchiver characterization update) + `GamePersistence`
  load/save/reset + archive passthrough (261–264 precedent; 0 new stores, 0
  version bumps): `putGameModeData`/`getGameModeData`
  (`__gamemode__:<worldId>`); `open()` bulk-load beside the 264 hydration
  (absent → null; non-object/wrong-version/unknown-mode/unknown-keys → null +
  recorded error); `initialGameMode` getter + `saveGameMode` fire-and-forget
  with `disposed`/`resetCompleted` guards; 257 reset deletes the key;
  `WorldArchive.gameModeData` OPTIONAL + `WorldArchiver` export/import
  passthrough (v1/v2-without import as null). New
  `tests/unit/GameModePersistence.test.ts` (save → flush → reopen → getter
  equal; absent → null; 4+ corrupt shapes → null + error recorded; reset
  deletes; archive v1/v2-without import null, export carries; hostile payload
  through `deserializeGameModeState` still throws). Evidence: suite green;
  existing storage suites untouched-green.

## D. Live rules (TDD where headless)

- [x] **T5.** `PlayerInteraction` mode-rule callbacks (DONE 2026-09-11; 26/26 green incl. 6 new) (additive options
  `depletesItems`/`instantBreak`/`dropsLoot`, defaults true/false/true):
  place skips `consumeSelected` when deplete is false (empty-hand guard stays);
  `advanceBreak` completes instantly when instant is true; `finishBreak` skips
  loot/XP/durability when drops is false; unbreakable still refuses. Extend
  headless interaction suites (no Game import): place-no-deplete vs
  survival-deplete, instant-vs-timed break, clean-break spawns nothing,
  unbreakable-refuses, defaults-unchanged. Evidence: suites green.
- [x] **T6.** `PlayerPhysics.isFlying` hook (DONE 2026-09-11; 21/21 green incl. 3 new) + Game flight drive contract:
  physics skips gravity/terminal/fall-accumulation while `isFlying()` is true
  (collision integration unchanged); Game sets `velocity.y` from
  `resolveCreativeFlightVelocity` before `physics.update` and zeroes
  `fallDistance` after. `PlayerPhysics` unit extensions (hover/rise/sink vs
  legacy-fall with hook absent). Evidence: suites green.

## E. Game store + menu UI

- [x] **T7.** `Game` mode store + live wiring (DONE 2026-09-11; typecheck + lint clean; live behavior pinned by T9/T10) (narrowest validation per site):
  `gameMode` field (default survival), hydrate (injected + late-load with panel
  re-render), `getGameMode`/`setGameMode`/`setGameModeFromText`/`toggleGameMode`
  (identity/invalid = false no-op; switch persists + chip + toast),
  `survivalStatsDeplete` gate on the survival tick + `hurtPlayer`-style guard on
  all direct `survival.damage` sites, bonemeal-consume gate on
  `depletesItems`, interaction/physics closures over the live mode,
  `saveGameMode()` on switch + dispose + pagehide (+ autosave site),
  simulation-gate + pause-guard + respawn/dispose closes learn `creativeOpen`,
  HUD `gamemode-toggle` chip (aria-live) + `KeyE` toggle via
  `InputManager.consumeCreativeToggle()`. Validation: typecheck + lint clean;
  live behavior pinned by T9/T10 E2E. Evidence: typecheck + lint outputs.
- [x] **T8.** `CreativeMenuPanel` + shell: (DONE 2026-09-11; typecheck + lint clean; panel renders — pinned by T9/T10) pure view (search input, rows with
  `data-creative-row`, status line, signature-guarded render) over Game deps
  (`getQuery/setQuery/listItems/grantItem/onClose`); `index.html` dialog
  (`#creative`, `#creative-search`, `#creative-list`, `#creative-status`,
  `#creative-close`) + HUD chips (`#creative-open`, `#gamemode-toggle`);
  `src/styles.css` menu styles (261–263 class parity); Game
  `openCreative/closeCreative` one-container discipline both directions,
  `getCreativeItems/searchCreative/grantCreativeItem` seams
  (grant = full-stack `addItem` + `hotbar.render()`, false + status on
  unknown/full). `window.__voxelGame` exposes the T9/T10 seam set (main.ts gate
  parity with 263). Evidence: typecheck + lint clean; panel renders in E2E.

## F. Browser E2E

- [x] **T9.** `tests/e2e/creative-mode.spec.ts` journey (DONE 2026-09-11; PASS headless 12.3s — text-seam switch, menu browse/search/grant-click, hover, place-no-deplete, instant-clean-break, reload-preserves) (enter creative → pick
  from menu → place without depleting → break instantly → reload persists
  mode): boot → `setGameModeFromText(' Creative ')` true → open menu via HUD
  chip → search narrows → grant grows inventory by full stack → select granted
  stack → place (count unchanged) → mine target (cell air within a tick,
  no spawns) → reload → mode still creative + counts stable. Evidence: spec
  passes headless.
- [x] **T10.** Survival-contrast + lifecycle E2E: (DONE 2026-09-11; PASS headless 14.2s — survival fall+deplete, invalid/identity no-ops, HUD toggle both ways, KeyE/C/blur lifecycle, unknown-grant graceful) survival place depletes by one;
  `setGameModeFromText('bogus')` false with mode unchanged; `toggleGameMode`
  flips back and forth with chip label; menu lifecycle (open → `KeyE` close →
  reopen → chip close → crafting-toggle closes → blur keeps → invalid grant
  false). Evidence: spec passes headless.

## G. Regression + gate + handoff

- [x] **T11.** Full regression (DONE 2026-09-11; typecheck PASS; lint 0 errors / 85 warnings; unit 415 files 4967+1; build 2.38s; file-audit 2738 PASS; validate-state PASS) (no C265 row until VERIFIED, C259–C264
  precedent): `npm run typecheck` PASS; `npm run lint` 0 errors;
  `npm test` (new: CreativeInventory, CreativeFlight, GameModePersistence;
  extended: PlayerInteraction, PlayerPhysics; characterization updates only
  where pinned-behavior-preserving); `npm run build` PASS; file-audit PASS;
  `validate-state` PASS. 111/117/131/185/192/258–264 verification files
  untouched (`git status` confirms — touch set is Game/player/storage/ui/tests/
  e2e/shell only). Evidence: exact outputs in verification.md.
- [x] **T12.** Full E2E: (DONE 2026-09-11; 77/77 PASS 28.7m — 75 + 2 new, zero regressions; last-run.json passed/[]) `npm run test:e2e` PASS incl. creative-mode specs
  (journey + contrast/lifecycle); zero regressions;
  `test-results/.last-run.json` `{"status":"passed","failedTests":[]}`.
- [x] **T13.** Reconciliation + state + publish: (DONE 2026-09-11; verification VERIFIED; C265 matrix row exact + counts + note; PROGRAM_STATE 13/13 100%, 258 BLOCKED kept, mandatory/required true, advancementAllowed true; validate-state PASS; committed + pushed, remote==local verified) artifacts re-read vs
  implementation, drift fixed; C265 matrix row exact + summary counts + note
  flipped to VERIFIED; `PROGRAM_STATE.json`/`.md` checkpoint (13/13 100%,
  heads recorded, 258 BLOCKED blocker kept, mandatory/required true,
  advancementAllowed true); `validate-state` PASS; commit, push to
  `origin/main`, remote head verified, `published_head` recorded; final report
  (SHAs, status, completion, validations, blockers, next action). Do NOT mark
  258 VERIFIED; do NOT touch headed FPS work; do NOT reopen 259–264.
