# Tasks: 260-live-brewing-stand-production-integration

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Furnace parity (251) is mirrored, never forked;
enchanting (259) shell/lifecycle patterns are reused.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 260 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=260-live-brewing-stand-production-integration ACTIVE; 258
  recorded BLOCKED; 259 recorded VERIFIED; nextExactAction = T2). Evidence:
  `git diff` of the four files.
- [x] **T2.** Quality-gate the package: PASS 2026-09-11 — number/name matches sequence; 258-BLOCKED/259-VERIFIED exception owner-authorized; proposal 11/11, design 14/14, spec MUST/SHALL scenarios throughout; no normative placeholders; `node scripts/validate-state.mjs` PASS at session_start_head a1a734c. number/name matches CHANGE_SEQUENCE.md
  row; previous-change exception explicitly owner-authorized (258 stays
  BLOCKED per CHANGE_SEQUENCE_OVERRIDES.md, 259 stays VERIFIED; no headed
  work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Registries + art (TDD where cheap)

- [x] **T3.** Block 62 + items 64–66 + atlas tiles 66–68 (AtlasGrid single-source UV fix for worker parity; BrewingRecipes id realignment to live-registry shape; fingerprint verified unchanged by construction): see T15 for full-regression evidence. `BlockId.BrewingStand`
  + opaque-cube def (pickaxe, 0.5, `dropItem`, tile 66 faces);
  `ItemId.BrewingStand/BlazePowder/Potion` + defs (stand `placeBlock` stack
  64; powder stack 64; potion `stackSize` 1, no `placeBlock`); `TILE_INDEX`
  + 3 original procedural painters + `ATLAS_ROWS` 4→5; verify
  `PINNED_WORLDGEN_STATE_FINGERPRINT` is unchanged by construction (closed
  generation-relevant set) and the v2 matrix hash is unchanged;
  new `tests/unit/BrewingRegistry.test.ts` (ids/names/stack/place/pins +
  tiles non-blank + prior tiles stable). Evidence: new tests pass; full
  unit still green (incl. block-state count formula + fingerprint suite).

## C. Host (TDD: fake world + capturing persistence)

- [x] **T4.** `LiveBlockEntityHost` brewing section: 17/17 `LiveBrewingHost` green (incl. real 400-tick awkward→speed, safe pause, stale/quarantine/hostile); furnace host suite untouched-green. `brewingContext` dep
  (`createDefaultBrewingContext`), `placeBrewing`/`removeBrewing`/
  `hasBrewing`/`getBrewingState`/`applyBrewingMenuSlots`/`tickBrewingStands`
  + brewing hydration (skip foreign typeKeys, version-gate, idempotent) +
  shared quarantine; furnace methods untouched. New
  `tests/unit/LiveBrewingHost.test.ts` (place/remove/get/apply/tick incl.
  400-tick awkward→speed completion, fuel gating, safe pause, non-simulating
  freeze, stale lazy removal, corrupt/future quarantine, hostile batches:
  foreign keys/duplicates/bad versions). Evidence: suite green; furnace host
  suite still green.
- [x] **T5.** Persistence compatibility check: 3/3 `BrewingPersistence` green (save→flush→reopen with contents/timers, empty-snapshot no-resurrection, furnace coexistence); zero format change. brewing rows through the
  existing 036 envelope + `GamePersistence` chunk units with zero format
  change; old-save load covered by existing suites. New
  `tests/unit/BrewingPersistence.test.ts` (serialize round-trip with bottle
  contents through the host persist/serialize path + hydrate restore +
  version quarantine). Evidence: suite green.

## D. Panel (TDD: FakeElement shim, node env)

- [x] **T6.** `src/ui/BrewingPanel.ts` skeleton + render: 13/13 `BrewingPanel` green (fail-fast, show/hide, 39 cells, progress widths, status strings, zero-write gated render). show/hide/isVisible
  + `Brewing element missing` fail-fast; bottle/fuel/ingredient cells,
  brew-arrow + fuel-flame bars, status line, 36 player cells, cursor chip;
  signature-gated render. New `tests/unit/BrewingPanel.test.ts` FakeElement
  harness (construction/missing-id/show-hide + progress widths + status
  strings + zero-write second render). Evidence: suite green.
- [x] **T7b.** 106 component-carry completion: 12/12 `MenuTransactionComponents` green + 106/202/203 family suites unchanged green (component-less byte-identical). (hidden prerequisite found in
  implementation): `MenuCursor.components` + carry-on-pickup/place/swap/
  split/quickMove + merge gated on `menuComponentsEqual` + orphan clearing
  on empty; component-less flows byte-identical. New
  `tests/unit/MenuTransactionComponents.test.ts` (carry per op, mismatch
  swap/no-merge, orphan clearing, canonicalization order-insensitivity,
  cursor validation). 106 verification file untouched (historical); behavior
  contract extended by this change's spec (BREW-3.2). Evidence: new suite +
  full unit green (106/202/203/container suites unchanged green).
- [x] **T7.** Panel transactions: pinned by `BrewingPanel` suite (quick-move ordered insert with contents, cursor-contents settle shape, corrupt-abort identity, vanished-stand no-op) + `LiveBrewingIntegration` 9/9. derive fresh menu → one 106 transaction →
  atomicity guard (every content-bearing result converts or the whole
  transaction aborts) → `applySlots` → player write-back (components intact)
  → cursor (components preserved in `takeCursor`) → re-render; null-state
  render is a no-op. Unit pins quick-move insert, left/right clicks,
  corrupt-abort identity, vanished-stand no-op, cursor-contents settle shape.
  Evidence: suite green (may extend the T6 file or
  `tests/unit/BrewingPanelTransactions.test.ts`).

## E. Game wiring + shell (mirror furnace 251 / enchanting 259)

- [x] **T8.** `Game` brewing session lifecycle: typecheck PASS; panel/host suites green; `openBrewing`/`closeBrewing`/getters/seam constructed (behavioral evidence: T12/T13). `brewingOpen`/`brewingPos`/
  `brewingPanel` + construction; `openBrewing(x,y,z)` (`hasBrewing` guard,
  closes furnace/crafting/enchanting first, lock/overlay handling);
  `closeBrewing()` (component-preserving cursor settle via
  `insertBrewingStackPreservingComponents`, hide, overlay return);
  `isBrewingOpen` + `brewingSessionPosition` getters;
  `testGrantAwkwardBottle()` setup seam. Typecheck PASS + panel/host suites
  green.
- [x] **T9.** Routing + placement + break: typecheck PASS; interaction/inventory/host suites green (behavioral evidence: T12/T13). `PlayerInteraction` brewing-stand
  `use` carries coords (furnace parity); Game routes stand+coords to
  `openBrewing`; committed placement of block 62 instantiates the host
  record; `onBlockBrokenAt` pre-closes a matching panel, removes exactly
  once, drops contents (direct insert first, plain loot spill on overflow)
  with no XP path; furnace/enchanting `use` branches untouched. Focused
  suites green (interaction + inventory + host).
- [x] **T10.** Upkeep + gates + parity: typecheck PASS (behavioral evidence: T13). per-frame walk-away (>8)/destroyed
  close + live re-render; `brewingOpen` in the simulation-active gate (no
  selection-void: furnace parity — the cursor settles on close, nothing is
  selection-captured); C-toggle closes instead of stacking;
  pointer relock closes; blur/visibility keep panel without stacking;
  opening furnace/crafting/enchanting closes brewing; death
  (`respawnPlayer`) + `dispose()` close before flush. Typecheck PASS.
- [x] **T11.** Shell: `index.html` `#brewing` + `brewing-*` styles added (.html/.css/.ts only, no binaries); `npm run build` PASS (2.21s). `index.html` `#brewing` block (ids per design) +
  `src/styles.css` `brewing-*` styles (furnace-mirrored); additions are
  .html/.css/.ts only (no binaries; `git status` check). Build PASS.

## F. Browser E2E (closes R-8 brewing half)

- [x] **T12.** `tests/e2e/brewing.spec.ts` journey: PASS 1.3m headed — place 62 → open (held untouched) → real-click insert → 400-tick live brew (speed 480/1, exact consumption) → collect → close → pagehide+reload field-for-field → break (drops) → reload no-resurrection. (furnace-harness shape):
  setup (stand item + `testGrantAwkwardBottle` + redstone + blaze powder) →
  place stand (block 62) → hold + right-click opens panel (assert contents +
  progress zeros) → real-click insert bottle/ingredient/fuel → close →
  400-tick brew → reopen → assert speed (480/1) + exact consumption →
  collect via real click → close → pagehide+reload → field-for-field persist
  → break → drops + no-resurrection reload. Evidence: spec passes headed.
- [x] **T13.** Lifecycle E2E: PASS — walk-away closes + overlay; blur keeps panel unstacked; destroy-while-open closes + overlay (one harness fix: walk back into reach before reopen). walk-away closes with overlay return;
  blur keeps panel without overlay stacking; break-while-open closes +
  settles + drops. Evidence: spec passes headed.

## G. Regression + gate + handoff

- [x] **T14.** R-8 brewing-half closure + matrix note: risk-register R-8 brewing half CLOSED with 260 evidence (isEmpty latent stays); `PARITY_MATRIX.md` post-terminal brewing note (no C260 row until VERIFIED, per C253–C259 precedent); 123/251/259 verification files untouched (git status confirms); file-audit manifest extended with 14 new-file rows + `validate-file-audit.mjs` PASSED (2684 rows).
- [x] **T15.** Full regression: `npm run typecheck` PASS; `npm run lint` 0 errors (85 pre-existing warnings); `npm test` 400 files / 4779 passed + 1 skipped (new: BrewingRegistry 9, LiveBrewingHost 17, BrewingPanel 13, BrewingPersistence 3, MenuTransactionComponents 12, LiveBrewingIntegration 9; characterization updates: BlockRegistry 51, BlockItemSeparation allowlist, WorkerRegistryInitialization ATLAS_ROWS+tolerance; fingerprint unchanged); `npm run build` PASS (2.35s); file-audit PASSED (2684 rows); `validate-state` PASSED.
  Evidence: exact outputs in verification.md.
- [x] **T16.** Full E2E: `npm run test:e2e` 66/66 PASS (25.8m, single worker) incl. 2 brewing specs (journey + lifecycle); zero regressions; `test-results/.last-run.json` {"status":"passed","failedTests":[]}. Slow files memory-stress 12.6m / visual 7.0m as before; no flakes requiring isolation.
- [x] **T17.** Reconciliation + state: artifacts re-read vs implementation — drift fixed (design 106-untouched claim → T7b carry rules; affected-files list incl. AtlasGrid/WorkerMeshing/MenuTransaction/BrewingRecipes; fingerprint re-pin → verified-unchanged; spec BREW-9.2 + proposal likewise; 1 typo); C260 matrix row exact + summary (exact 243, total 256) + brewing note flipped to VERIFIED; `PROGRAM_STATE.json`/`.md` checkpoint (19/19 100%, heads `a1a734c`, 258 BLOCKED blocker kept); `validate-state` PASS.
- [ ] **T18.** Publish: commit coherent session work, push to `origin/main`,
  verify remote head, record `published_head`; final report (SHAs, status,
  completion, validations, blockers, next action). Do NOT mark 258 VERIFIED;
  do NOT touch headed FPS work; do NOT reopen 259.
