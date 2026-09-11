# Tasks: 259-enchanting-panel-ui

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Coordinate-free `openEnchanting` fallback is
kept for non-table `use` paths (bonemeal).

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 259 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=259-enchanting-panel-ui ACTIVE; 258 recorded BLOCKED;
  nextExactAction = T2). Evidence: `git diff` of the four files.
- [x] **T2.** Quality-gate the package: PASS 2026-09-11 — number/name matches CHANGE_SEQUENCE.md row; previous-change exception explicitly owner-authorized (258 stays BLOCKED per CHANGE_SEQUENCE_OVERRIDES.md; no headed work); proposal 11/11 sections, design 14/14, capability spec with MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/regression/docs/gate; no normative placeholders (sole `TODO` is the meta word in this task); `node scripts/validate-state.mjs` PASS at session_start_head 3a39b59e. number/name matches sequence;
  proposal/design/spec sections complete per protocol; every MUST/SHALL
  has a scenario; no TODO placeholders; `npm run validate-state` (or
  `node scripts/validate-state.mjs`) PASS. Evidence: command output.

## B. Panel view (TDD: FakeElement shim, node env)

- [x] **T3.** Failing-first panel skeleton: `src/ui/EnchantingPanel.ts` show/hide/isVisible + `Enchanting element missing` fail-fast; `tests/unit/EnchantingPanel.test.ts` FakeElement harness. 15/15 pass (incl. T4–T6 cases). `src/ui/EnchantingPanel.ts`
  with constructor/`show/hide/isVisible`/`requireElement` throw
  (`Enchanting element missing: #<id>`), plus
  `tests/unit/EnchantingPanel.test.ts` FakeElement harness proving
  construction, missing-id throw, and show/hide. Evidence: new tests pass.
- [x] **T4.** Offer render: 3 buttons with roman-numeral names + costs, aria-labels, disabled/aria-disabled on unaffordable, signature-gated zero-write second render — all pinned by unit tests. `render()` derives 3 offer buttons from
  `getSession()` with names (roman numerals, raw-key fallback) + costs,
  `data-offer-index`, aria-labels; signature-gated (second render writes
  nothing). Tests pin names/costs/disabled flags for affordable vs
  unaffordable vs empty offers. Evidence: unit pass.
- [x] **T5.** Reselect: clamp/toggle/empty-block + status transitions pinned by unit tests (PANEL-3.1–3.3). `selectOffer` clamp/toggle, empty-offer block,
  `selectedOffer()`, status-line transitions (`Select an offer first.`,
  pending-offer naming). Tests pin T3 scenarios PANEL-3.1–3.3.
- [x] **T6.** Apply routing: single-delegate success with fresh-session re-render + per-reason status strings + null-session hide (INV-2) pinned by unit tests. `applySelected()` delegates the selected
  index once; success re-derives a fresh session + resets selection +
  `Enchanted with …` status; each failure reason maps to its status
  string with no delegate over-call; null session hides (INV-2).
  Tests pin PANEL-4.2–4.4 + PANEL-5.2. Evidence: unit pass.

## C. Game wiring + shell (mirror furnace 251)

- [x] **T7.** `Game` session lifecycle: enchantingOpen/Pos/Panel field + construction; `openEnchanting(x,y,z)` with table-cell guard + container exclusivity + lock/overlay handling; `closeEnchanting()`; `isEnchantingOpen` + `enchantingSessionPosition`. Typecheck PASS. `enchantingOpen`/`enchantingPos`/
  `enchantingPanel` field + construction; `openEnchanting(x,y,z)` opens
  the panel (closes furnace/crafting first, releases lock, hides
  overlay/crosshair/hud/hotbar, clears target); `closeEnchanting()`
  (clears session/slot/pos/flag, hides panel, overlay `Click to play`);
  `isEnchantingOpen` + `enchantingSessionPosition` getters. Evidence:
  typecheck + unit (panel suite still green; guard suite green).
- [x] **T8.** `use`-case routing with coords: PlayerInteraction table-`use` carries coords; Game routes table+coords (bonemeal precedence preserved); target fallback kept. Focused suites 54/54 green. `PlayerInteraction`
  enchanting-table `use` carries block coords (furnace parity);
  `Game` routes table+coords to `openEnchanting(x,y,z)`; bonemeal and
  other `use` paths keep the target-derived fallback. Evidence:
  typecheck + existing interaction tests green.
- [x] **T9.** Per-frame upkeep + gates: walk-away/destroy/voided-session close, simulation gate, updateHotbar void→close, onBlockBrokenAt pre-close. Typecheck PASS. walk-away (>8) and
  table-destroyed close in `update()`; `enchantingOpen` in the
  simulation-active gate; `updateHotbar` void path closes an open panel;
  `onBlockBrokenAt`-adjacent pre-close for enchanting tables.
  Evidence: typecheck + unit green.
- [x] **T10.** Focus/relock/toggle/death/dispose parity: C-toggle closes, relock closes, blur/visibility guards extended, death + dispose close. Typecheck PASS. C-toggle closes
  enchanting instead of stacking; pointer relock closes; blur path keeps
  panel without overlay stacking; death (`respawnPlayer`) closes;
  `dispose()` closes before flush. Evidence: typecheck + unit green.
- [x] **T11.** Shell: `#enchanting` block + `enchanting-*` styles + `.hidden` re-assert; additions are .html/.css/.ts only (no binaries). Build runs with E2E. `index.html` `#enchanting` block (ids per design)
  + `src/styles.css` `enchanting-*` styles (furnace-mirrored). No new
  binary assets (PANEL-8.1 file-extension check). Evidence: `git status`
  shows only `.html/.css/.ts` additions + build PASS.

## D. Browser E2E (closes R-3)

- [x] **T12.** `tests/e2e/enchanting.spec.ts` journey: PASS 2.3m full-journey run — place table (block 32), open with pickaxe, 3 offers shown, reselect A→B via status asserts, real Apply click → `Enchanted with Efficiency IV, Fortune III (−30 levels, −30 lapis)`, stack/XP/lapis asserts, close→overlay, pagehide+reload→stack/XP persist. Helper fixed once (`StackComponentMap.entries()` shape). (furnace-harness
  shape): setup (enchanting-table item 31 + wooden pickaxe 20 + lapis 28
  + `addXp` levels) → place table (block 32) → hold pickaxe → right-click
  opens panel (assert item/XP/lapis/3 offers) → click offer A → click
  offer B (reselect) → click Apply → assert enchanted stack + XP/lapis
  deducted + status text → pagehide+reload → assert stack/XP persist →
  close. Evidence: spec passes headed.
- [x] **T13.** Lifecycle E2E: PASS — walk-away closes with overlay return; blur keeps panel without overlay stacking. One transient `Target crashed` (SwiftShader resource pressure, second boot back-to-back) cleared on isolation re-run (40s PASS) and on clean full-file re-run (2/2 PASS 1.8m). walk-away closes with overlay return;
  focus-loss keeps panel without overlay stacking (furnace parity).
  Evidence: spec passes headed.
- [x] **T14.** R-3 closure: risk-register R-3 marked CLOSED with 259 evidence; PARITY_MATRIX post-terminal note added (no row until VERIFIED, per C253–C258 precedent); 120/251 verification files untouched. risk register R-3 row marked closed with this
  change as evidence; `PARITY_MATRIX.md` enchanting note added; 120/251
  verification files untouched. Evidence: diff.

## E. Regression + gate + handoff

- [x] **T15.** Full regression: typecheck PASS; lint 0 errors; `npm test` 394 files / 4716 passed + 1 skipped (guard/furnace/interaction suites green); `npm run build` PASS (2.32s); file-audit manifest extended + validator PASSED. `npm run typecheck`, `npm run lint`,
  `npm test` (incl. `EnchantingSessionGuard` + furnace suites unchanged
  green), `npm run build`. Evidence: exact outputs in verification.md.
- [x] **T16.** Full E2E: `npm run test:e2e` 64/64 PASS (28.4m) incl. both enchanting specs; zero regressions. Targeted re-run after the void-path step: 2/2 PASS. `npm run test:e2e` (new enchanting specs green;
  no pre-existing spec regressed; environment-marginal flakes
  re-run-isolated with dossier). Evidence: outputs in verification.md.
- [x] **T17.** Reconciliation + state: artifacts re-read vs implementation (no drift; relock-close/death/dispose wiring-only per furnace parity, recorded); C259 matrix row + summary counts; PROGRAM_STATE.json/.md checkpoint; `validate-state` PASS. re-read every 259 artifact vs
  implementation; tasks.md checkboxes truthful; verification.md complete
  (requirement evidence table, commands, edge/migration/perf sections,
  advancement decision); `PROGRAM_STATE.json`/`.md` checkpoint
  (completion %, lastCompletedTask, validations, heads, blockers,
  nextExactAction); `validate-state` PASS. Evidence: command output.
- [x] **T18.** Publish: committed + pushed to `origin/main`, remote head verified, `published_head` recorded. 258 NOT marked VERIFIED; no headed FPS work touched. commit coherent session work, push to
  `origin/main`, verify remote head, record `published_head`; final
  report (SHAs, status, completion, validations, blockers, next action).
  Do NOT mark 258 VERIFIED; do NOT touch headed FPS work.
