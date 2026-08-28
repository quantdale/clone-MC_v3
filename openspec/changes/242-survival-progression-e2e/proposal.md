# Proposal: 242-survival-progression-e2e

## Problem

The progression primitives implemented across the parity arc — tool-tier harvest
rules (`HarvestRules`, 114), food (`FoodComponentRuntime`, 124), survival
(`SurvivalSystem`), experience (`ExperienceSystem`, 117), Nether portals
(`NetherPortal`, 177 and `NetherPortalLinking`, 178), End portals
(`EndPortalProgression`, 182), the Ender Dragon (`EnderDragon`, 183 /
`BossFramework`, 153), End exit (`EndExitProgression`, 184), and core
advancements (`CoreProgressionAdvancements`, 186 / `AdvancementFramework`, 185) —
exist today as **pure, headless, individually unit-tested modules**. They are
**not composed into any single headless driver**: there is no end-to-end
verification that a fresh world can actually traverse the full survival chain
(tools → food → shelter → Nether → End → boss completion) deterministically and
headlessly. There is also no save/reload-mid-progression check across the whole
chain, and no single end-state assertion proving the chain completed.

The individual unit suites prove each module in isolation, but nothing proves
the modules cooperate in the intended play order against a shared,
deterministically-seeded world.

## Goals

- Deliver a **headless Vitest progression harness** that composes the real
  production progression modules (never re-implementations) over an in-memory
  `WorldAccess` fixture and a seed-derived RNG stream, and drives them through a
  bounded, deterministic step budget.
- Define and verify the **six concrete progression stages** against the
  `CoreProgressionAdvancements` chain: fresh-world spawn (0), tools (1), food
  (2), shelter (3), Nether (4), End (5), and boss completion (6, the final
  end-state). Each stage has an **exact, observable completion assertion**.
- Prove **save/reload mid-progression**: snapshotting and restoring the full
  progression state at every stage boundary reproduces the same subsequent
  behavior as a fresh run from that stage.
- Prove **determinism**: identical `(worldSeed, step script)` input yields an
  identical final state hash.
- Prove **failure/abort**: a violated precondition (wrong tool for a mining
  level, fewer than 12 eyes of ender, invalid portal frame, teleport still on
  cooldown) aborts the scenario atomically, advances no stage, and reports a
  typed error — never silently succeeds.
- Add **browser E2E assertions** (Playwright, `VITE_E2E` build) for the stages
  the running game already reaches (fresh spawn survival state, tool crafting,
  food consumption, block placement for shelter) as a complementary seam to the
  headless harness.

## Non-goals

- No new gameplay features. This change does NOT implement, extend, or re-balance
  Nether generation, End generation, mobs, crafting, tools, food, XP, portals,
  the dragon, or advancements beyond what the existing modules already provide.
- No rendering, HUD, boss-bar, or UI changes.
- No multiplayer/network behavior (later changes 232-237 own those arcs).
- No redstone automation E2E (243 owns that).
- No changes to the shipped browser `Game` runtime wiring beyond what is needed
  to make already-reachable stages observable through the test hook; the
  authoritative chain driver is the headless harness, because Nether/End/boss
  are intentionally **not** wired into the rendered game today.

## Preconditions

- All progression modules listed above exist, are pure/headless, and have green
  individual unit suites. Confirmed at authoring time: `tests/unit/` contains
  `HarvestRules`, `FoodComponentRuntime`, `SurvivalSystem`, `ExperienceSystem`,
  `NetherPortal`, `NetherPortalLinking`, `EndPortalProgression`, `EnderDragon`,
  `BossFramework`, `EndExitProgression`, `AdvancementFramework`,
  `CoreProgressionAdvancements`, `DimensionManager`, and `SimulationHarness`
  tests.
- `SimulationHarness` (055) provides `step`, `stepUntil`, `snapshot`, `restore`,
  `reset`, and `run`. `WorldAccess` is an interface the real `World` implements,
  so an in-memory fixture can stand in. `SeedRng.createNamedRng(worldSeed,
  streamName)` (054) provides deterministic per-subsystem streams.
- The immediately preceding change (241) is verified and advancement is allowed
  before 242 is implemented.

## Dependencies

- `openspec/changes/055-simulation-test-harness` — the `SimulationHarness`
  deterministic stepper the harness builds on.
- `openspec/changes/054-deterministic-rng-streams` — `SeedRng` /
  `createNamedRng` for reproducible world and per-system streams.
- `openspec/changes/174-dimension-manager` — multi-dimension container +
  `WorldAccess` seam used to host overworld/nether/end in the harness.
- The progression modules listed under Goals (their public, pure APIs are the
  harness contract surface).
- `openspec/changes/055`-style test fixtures and the existing `tests/e2e`
  Playwright harness (`window.__voxelGame`, `waitForGame`,
  `enterPointerLock`) for the browser seam.

## Proposed change

Author a complete OpenSpec package for `242-survival-progression-e2e`:

1. `proposal.md`, `design.md`, `tasks.md`, `verification.md` per
   `SPEC_AUTHORING_PROTOCOL.md`.
2. Four capability specs under `specs/`:
   - `specs/progression-harness/spec.md` — the headless execution seam contract
     (deterministic stepping, snapshot/restore, atomic abort, state hash).
   - `specs/survival-progression/spec.md` — stages 0-3 (fresh world, tools,
     food, shelter) and their completion assertions.
   - `specs/nether-progression/spec.md` — stage 4 (portal build/light/enter and
     return linking).
   - `specs/end-progression/spec.md` — stages 5-6 (End entry, dragon defeat,
     completion persistence, exit portal, end-state assertions).

The package is documentation-only and contains no production code and no test
files. The implementing agent produces the harness (as test-support
infrastructure under `tests/`, not shipped game code), the stage tests, the
edge/failure tests, the determinism tests, and the browser E2E assertions per
these specs, then reconciles the package with the actual implementation.

## Compatibility and migration

No stored/public data format changes. The harness serializes existing module
state through their already-versioned snapshot/serialize contracts
(`SurvivalSnapshot` v1, `ExperienceSnapshot` v1, `BossFramework` `version: 1`
envelope, `SerializedDragonCompletion` v1, `SerializedAdvancementProgress` v1,
`DragonCompletionRecord`). No browser-save format changes. No migration needed.

## Risks

- **Scope creep into a later change**: wiring Nether/End/boss into the rendered
  `Game` would be large adjacent scope. Mitigation: the harness is the
  authoritative driver and lives under `tests/`; browser E2E is limited to
  stages the running game already reaches.
- **Determinism drift**: the harness composes modules that consume RNG. The
  contract pins every random draw to `createNamedRng(worldSeed, ...)` streams so
  a given seed is reproducible; the browser seam does not assert hashes.
- **Fixture fidelity**: an in-memory `WorldAccess` fixture must behave enough
  like the real `World` for the modules (block set/get, solid/air queries,
  portal frame/linking queries). The spec mandates using the real modules over
  the fixture and limiting fixture responsibilities to the `WorldAccess`
  contract.
- **Exhaustive budget**: a full chain could need many ticks. The spec mandates a
  bounded step budget per scenario and a budget-exceeded (not success) result.

## Rollback strategy

Documentation-only change; revert by removing the authored directory. The
implementing agent's changes are test-support fixtures plus assertions; they do
not alter shipped runtime behavior, so reverting is safe. No data migration is
involved.

## Definition of Done

- All six progression stages complete headlessly through the harness in a single
  seeded run, each with its concrete completion assertion green.
- Save/reload-mid-progression reproduces identical subsequent behavior at every
  stage boundary.
- Same-seed rerun produces the same final state hash.
- Every failure/abort scenario aborts atomically and advances no stage.
- Browser E2E asserts the survival-foundation stages through the running game.
- The baseline gate passes: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`.
- All spec requirements are reconciled with the actual implementation.

## Advancement gate

Target 100% task completion. The absolute floor is 90% with the documented
Advancement Exception path. No unresolved determinism, data-loss, or regression
blocker may remain; the baseline gate must pass.
