# Tasks — 251-live-furnace-production-integration

Status legend: `[x]` complete with evidence · `[ ]` open.

## 1. Runtime block-entity composition (A)
- [ ] `LiveBlockEntityHost` owning one `BlockEntityManager`; `replace()` order-preserving swap in the manager
- [ ] Placement hook: furnace placement creates exactly one tickable furnace instance
- [ ] Break/removal hook: `removeFurnace` removes the instance exactly once and returns final state
- [ ] Boot hydration from persisted 036 records before first frame; stale/malformed record quarantine

## 2. Fixed-tick simulation (B)
- [ ] `tickFurnaces` driven by `FixedTickDriver`, gated on simulating chunks only
- [ ] Pause/loading/non-simulating chunks stop smelting; no duplicate ticking
- [ ] Per-chunk dirty marking through `GamePersistence.saveBlockEntities`
- [ ] Chunk deactivation eager flush; resume-after-reload consumes fuel/produces output exactly once

## 3. Player interaction (C)
- [ ] Furnace target routes to container open instead of placement (before bone-meal branch)
- [ ] Open/close lifecycle: Esc, focus loss, destruction-while-open, death/respawn, walk-away rule
- [ ] Cursor stack returned to inventory (or dropped) on close; input isolated while open

## 4. Furnace UI (D)
- [ ] `FurnacePanel` DOM: input/fuel/output slots + 36 player slots + burn/smelt indicators
- [ ] Transactions over 106 semantics: left/right click, quickMove, placeOne; cursor rendering
- [ ] Output extraction transactional (no dupe/deletion); panel re-renders after each transaction/tick

## 5. Persistence (E)
- [ ] `GamePersistence.saveBlockEntities/loadBlockEntities/listAllBlockEntities` thin members
- [ ] Autosave, explicit flush, page reload, chunk unload/reload round-trips preserve all eight state fields
- [ ] Edit-while-write-in-flight keeps newest snapshot; no localStorage world authority

## 6. Breaking/drops (F)
- [ ] Furnace item drop + contained stacks as item entities at block center; xp orb for accumulated xp
- [ ] Open UI cannot retain a ghost reference to a destroyed furnace; persistent record invalidated

## 7. Recovery/adversarial (G)
- [ ] Malformed payload → skip+warn+degraded status; block still usable with fresh state
- [ ] Stale record where block is not a furnace → ignored and lazily deleted
- [ ] Full-output stack, invalid fuel, full inventory close, repeated open/close/save/reload safe

## 8. Tests
- [ ] Unit/integration: composition, tick ownership, pause, activation, save/reload, destruction, dupe-tick prevention, no-loss transactions, stale records (prove NEW wiring, not `tickFurnace` itself)
- [ ] E2E: full player journey — boot → obtain/place furnace → open → insert input+fuel → lit/progress → complete ≥1 smelt → collect output → close/reopen state → save/reload state → break cleanup

## 9. Governance + gates
- [ ] CHANGE_SEQUENCE post-terminal epoch section; PROGRAM_STATE ACTIVE transition; PARITY_MATRIX C251 row
- [ ] Risk register revisit (R-8 furnace half dispositioned against live wiring evidence)
- [ ] Full mandatory gate: validate-state, typecheck, lint, test, coverage (thresholds held), build, bundle check, audits ×2, e2e
