# Tasks: 242-survival-progression-e2e

## 1. Baseline & characterization

- [x] 1.1 Re-read this change's artifacts (`proposal.md`, `design.md`, and the four `specs/*/spec.md`) and confirm the actual current state matches the documented "Context/current state": the progression modules exist, are pure/headless, and are NOT wired into `Game.ts`. Catalog the six stages against the `CoreProgressionAdvancements` chain and confirm the stage→module→assertion mapping in `design.md` (stages 0-6, each with its concrete completion assertion) is accurate; reconcile any drift in `design.md`.
- [x] 1.2 Record the baseline gate numbers (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) into `verification.md` before any 242 test is added, so the 242 delta is measurable.

## 2. Headless progression harness

- [x] 2.1 Implement the test-support `ProgressionHarness` under `tests/` (e.g. `tests/support/ProgressionHarness.ts`) that composes the real production modules (`HarvestRules`, `FoodComponentRuntime`, `SurvivalSystem`, `ExperienceSystem`, `NetherPortal`, `NetherPortalLinking`, `EndPortalProgression`, `EnderDragon`, `BossFramework`, `EndExitProgression`, `AdvancementFramework`, `CoreProgressionAdvancements`, `DimensionManager`) over an in-memory `WorldAccess` fixture.
- [x] 2.2 Implement deterministic stepping (`step`, `stepUntil(stage, maxSteps)`) with `SimulationHarness` semantics, a bounded per-scenario step budget, and per-stage completion reporting (`isStageComplete`, `isChainComplete`).
- [x] 2.3 Implement `snapshot()` / `restore()` / `reset()` over the full progression state (tick, player position, player dimension, survival, experience, inventory, world edits, boss record, dragon completion record, advancement progress), with whole-payload validation and atomic rejection.
- [x] 2.4 Implement atomic abort on precondition failure: a violated precondition throws a typed error with a stable `code` (`wrong_tool_for_mining_level`, `not_enough_eyes_of_ender`, `invalid_portal_frame`, `portal_teleport_on_cooldown`, `not_fed`, `budget_exceeded`) and leaves state unchanged.
- [x] 2.5 Implement a deterministic `stateHash()` over the serialized progression state using only seed-derived RNG streams (`createNamedRng`); no `Math.random`. (The deterministic chain requires no random draws, so no RNG stream is instantiated; the no-`Math.random` invariant holds.)

## 3. Stage tests (headless)

- [x] 3.1 `survival-progression` tests: fresh-world baseline (position, survival 20/20/5, experience 0/0, overworld loaded, block below player), reload of fresh world, full tool chain with `stone_age → acquire_hardware → iron_tools → diamonds` ascending `achievedTick`, wrong-tool no-drop failure, food restore + starvation failure, air-tight shelter + reload persistence.
- [x] 3.2 `nether-progression` tests: build + light valid frame, invalid-frame failure, entry applies `floor(x/8)` scale + `minecraft:the_nether` + `enter_the_nether`, return ×8 linking, cooldown abort, reload-in-nether.
- [x] 3.3 `end-progression` tests: under-12-eyes failure, 12-eye activation + platform entry + `enter_the_end`, phase-to-defeat, defeated no-op, completion-record round-trip + reload, exit-portal spawn + `endExitDestination`, final end-state (defeat + exit + `free_the_end` + +500 XP), same-seed determinism.
- [x] 3.4 Determinism + save/reload-mid-progression tests: same-seed rerun → identical `stateHash()`; `restore(snapshot())`-then-step equals a fresh run from that point at every stage boundary (0-6).

## 4. Edge, integration, regression & final gate

- [x] 4.1 Edge/adversarial tests: budget-exceeded `stepUntil` returns `false` and never credits a stage; malformed `restore` payload rejected atomically; defeated-boss re-damage/re-heal no-op; already-complete advancement re-trigger no-op; `stateHash()` stable for unchanged state.
- [x] 4.2 Browser E2E (extend `tests/e2e/game.spec.ts`): assert fresh-spawn survival status (20 hearts / 20 hunger), a crafted `Wooden Pickaxe` in the hotbar with durability, food consumption changing hunger, and a placed-block shelter, through the `window.__voxelGame` hook on the `VITE_E2E` build.
- [x] 4.3 Confirm no shipped-game behavior changed (the harness and assertions are test-support only; `Game.ts` runtime wiring unchanged) and that no work silently belongs to change 243 or later (no redstone automation, no Nether/End rendering, no new gameplay).
- [x] 4.4 Full regression gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all pass; record evidence and final spec reconciliation in `verification.md`; update `tasks.md` checkboxes, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md`; advance 242 to VERIFIED.
