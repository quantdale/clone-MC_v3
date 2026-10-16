# Design: 242-survival-progression-e2e

## Context/current state

Authoring-time facts verified against the repository:

- The rendered game is composed in `src/engine/Game.ts`. It wires `SurvivalSystem`,
  `FoodComponentRuntime`, `ExperienceSystem`, `Inventory`, `Hotbar`,
  `HarvestRules`, `ItemEntityManager`, `XpOrbManager`, passive/hostile mobs, and
  a single overworld `World`. It drives frames through `GameLoop` (render
  clock), NOT `WorldTickProcess`.
- The progression modules — `src/world/HarvestRules.ts`, `src/player/FoodComponentRuntime.ts`,
  `src/player/SurvivalSystem.ts`, `src/player/ExperienceSystem.ts`,
  `src/simulation/NetherPortal.ts`, `src/simulation/NetherPortalLinking.ts`,
  `src/simulation/EndPortalProgression.ts`, `src/simulation/EnderDragon.ts`,
  `src/simulation/BossFramework.ts`, `src/simulation/EndExitProgression.ts`,
  `src/simulation/AdvancementFramework.ts`,
  `src/simulation/CoreProgressionAdvancements.ts`, and
  `src/world/DimensionManager.ts` — are **NOT imported or wired by `Game.ts`**.
  They are pure, headless, individually unit-tested modules.
- `src/simulation/SimulationHarness.ts` (055) provides `step(times)`,
  `stepUntil(predicate, maxSteps)`, `snapshot()`, `restore(snapshot)`,
  `reset()`, and scoped `run(fn)`. It is the test-oriented deterministic
  stepper.
- `src/simulation/WorldTickProcess.ts` (224) is the production counterpart
  (fixed-timestep clock, `step`/`update`, `isStopped`/`lastError`/`reset`). It is
  a valid alternative driving seam; the harness may use either, but the spec
  mandates `SimulationHarness`-style semantics for snapshot/restore.
- `src/world/DimensionManager.ts` (174) registers independently loaded
  dimensions over the `WorldAccess` interface; the real `World` implements
  `WorldAccess`, so an in-memory fixture can stand in headlessly.
- `src/simulation/SeedRng.ts` (054) exposes `SeedRng` and
  `createNamedRng(worldSeed, streamName)` for deterministic per-subsystem
  streams.
- Browser E2E lives in `tests/e2e/game.spec.ts` and drives a production build
  served by `vite preview` with `VITE_E2E=true`. It boots through
  `waitForGame(page)` (waits for `#loading` hidden), enters pointer lock via
  `enterPointerLock(page)`, and reaches the live game through the
  `window.__voxelGame` test hook (exposed only when `import.meta.env.DEV ||
  import.meta.env.VITE_E2E`).
- Persistence in the running game is `localStorage`: `voxel-game-edits-v1:<seed>`
  (world edits via `world.exportEdits`/`importEdits`) and
  `voxel-game-state-v1:<seed>` (`GameSaveSnapshot` v1: `seed`, `player.position`,
  `yaw`, `pitch`, `inventory`, `survival`, `experience`).
- Every progression module already has a `tests/unit/` suite. What is missing is
  a **cross-module, end-to-end, deterministic, save/reload-tolerant headless
  driver** and the associated end-state assertions.

### Current-state conclusion

Because Nether/End/boss are not wired into the rendered `Game`, the browser
cannot reach them today. The only faithful way to verify the full chain
"headlessly" is a harness that composes the real production modules directly.
The browser E2E seam is complementary and limited to stages the running game
already reaches (survival foundation).

### Reconciliation (drift from the authored proposal/design)

The authored proposal assumes an `iron_pickaxe` / `diamond` *item* and an
`end_portal` / `end_portal_frame` *block*. Those are content-expansion scope
(changes 215-220) and are explicitly OUT of bounds for 242 (no new gameplay /
content). The real registries provide `wooden_pickaxe` (tier 1) and
`stone_pickaxe` (tier 2) only, and a single `nether_portal` block. The harness
therefore:

- asserts the real pickaxes the registry provides (wooden + stone) AND fires the
  full core advancement chain `stone_age → acquire_hardware → iron_tools →
  diamonds` in order; the `iron_tools` / `diamonds` advancement triggers are real
  definitions whose `itemKey`s reference the (deferred) items.
- represents the End portal / exit portal in the fixture with the existing
  `nether_portal` block id; the geometric End frame is placed as obsidian and
  activation is the real `endPortalIsActivated` count check.

These reconciliations are reflected in the harness header, the capability specs,
and `verification.md`. The deterministic chain needs no random draws, so no
`SeedRng` stream is instantiated; the no-`Math.random` invariant holds.

## Target state

After 242:

- A headless Vitest `ProgressionHarness` (test-support infrastructure under
  `tests/`) drives the full chain 0→6 deterministically over an in-memory
  `WorldAccess` fixture, a seeded `SeedRng` stream, and the real production
  modules. No shipped game code changes beyond any minimal test-hook exposure
  already required.
- Six named stages with exact completion assertions (see the capability specs).
- Save/reload-mid-progression at every stage boundary.
- Deterministic final-state hash (identical seed/script → identical hash).
- Atomic failure/abort semantics with typed errors.
- Browser E2E assertions for the survival foundation.
- All spec requirements reconciled with the implementation and the baseline gate
  green.

## Invariants

- The harness composes the real production modules; it MUST NOT re-implement
  harvest, food, survival, XP, portal, boss, advancement, or dimension logic.
- All random draws used by the harness MUST come from `SeedRng` streams derived
  from the harness `worldSeed` (via `createNamedRng`); no `Math.random`.
- A failed scenario step MUST leave progression state unchanged (atomic).
- A stage reports complete only when its concrete completion assertion holds; a
  stage never reports partial credit.
- `stepUntil` bounded by a per-scenario `maxSteps`; exceeding the budget is a
  budget-exceeded result, never a success.
- Snapshot/restore is a pure state round-trip: `restore(snapshot())` returns the
  harness to the exact captured point, and stepping forward after restore yields
  identical results to stepping forward from that point in a fresh run.
- All persistence round-trips go through the modules' existing versioned
  serialize/deserialize contracts; no new wire or save format is introduced.

## API and data model

The harness is test-support code; its shape is intent (sketches describe the
seam, not shipped runtime behavior). All identifiers reference existing
production symbols.

```ts
// tests/support/ProgressionHarness.ts (intent)
export type ProgressionStage =
  | 'fresh-world' | 'tools' | 'food' | 'shelter'
  | 'nether' | 'end' | 'boss-complete';

export interface ProgressionHarnessOptions {
  readonly worldSeed: number;
  /** In-memory WorldAccess fixture seeded by worldSeed. */
  readonly world: WorldAccess;
  readonly registries: {
    blockTags: TagRegistry; itemTags: TagRegistry;
    boss: BossRegistry; advancements: readonly AdvancementDefinition[];
  };
  /** Named streams derived from worldSeed; defaults to createNamedRng(worldSeed, name). */
  rng?: (name: string) => SeedRng;
}

export interface ProgressionStateSnapshot {
  tick: number;
  playerPosition: readonly [number, number, number];
  playerDimension: string;
  survival: SurvivalSnapshot;      // v1
  experience: ExperienceSnapshot;  // v1
  inventory: unknown;              // Inventory.snapshot()
  worldEdits: unknown;             // world.exportEdits() via fixture
  boss: SerializedBoss | null;             // BossFramework v1 envelope or null
  dragonCompletion: SerializedDragonCompletion | null;
  advancementProgress: Record<string, SerializedAdvancementProgress>;
}

export class ProgressionHarness {
  constructor(opts: ProgressionHarnessOptions);
  step(times?: number): number;                                  // SimulationHarness-style
  stepUntil(stage: ProgressionStage, maxSteps: number): boolean; // true iff stage completed
  snapshot(): ProgressionStateSnapshot;
  restore(s: ProgressionStateSnapshot): void;                    // validates first, atomic
  reset(): void;
  /** Stage completion flags; a stage is complete only when its assertion holds. */
  isStageComplete(stage: ProgressionStage): boolean;
  isChainComplete(): boolean; // all 0..6 complete
  stateHash(): string;        // deterministic hash over serialized progression state
  /** Performed actions the scenario script needs (break, place, eat, teleport...). */
  runScript(script: ProgressionScript): void; // bounded, atomic on failure
}
```

The harness drives the modules through their real constructors/entry points
(`HarvestRules`, `SurvivalSystem.update/eat`, `resolveFoodConsume`,
`ExperienceSystem.addXp`, `validatePortalFrame`/`NetherPortalLinking`,
`EndPortalProgression`, `BossFramework.startBossFight/damageBoss/tickBossFight`,
`EnderDragon`, `EndExitProgression`, `AdvancementFramework.applyAdvancementTrigger`,
`CoreProgressionAdvancements`).

## Control/data flow

1. Construct harness with `worldSeed`; register overworld/nether/end dimensions
   in `DimensionManager` over the in-memory fixture; derive named RNG streams.
2. `runScript` executes the ordered stage script (gather→craft→eat→shelter→
   portal→nether→end→dragon→exit). Each action goes through the real module API
   against the shared fixture.
3. Advancement triggers are fired from the same actions (obtain tool → dimension
   enter → boss defeat) through `applyAdvancementTrigger`.
4. After the final action, `stateHash()` is taken over the serialized progression
   state; the script asserts each `isStageComplete`.
5. Save/reload scenarios call `snapshot()` at a stage boundary, `reset()`, then
   `restore(snapshot)` and continue; the continued prefix must equal a fresh run
   from that boundary.
6. Failure scenarios inject a precondition violation and assert the harness
   aborts atomically with a typed `ProgressionError`.

## Detailed behavior

Stage definitions and exact completion assertions (normative in the capability
specs):

| # | Stage | Concrete completion assertion |
|---|---|---|
| 0 | fresh-world | Player at deterministic spawn; `survival == {20,20,5}`; `experience == {level:0, xp:0}`; `minecraft:overworld` loaded; block below player is not air. |
| 1 | tools | Inventory contains wooden, stone, and iron pickaxes and ≥1 diamond; advancements `stone_age`, `acquire_hardware`, `iron_tools`, `diamonds` achieved in that order (`achievedTick` ascending). |
| 2 | food | A consumed food raises hunger/saturation per `resolveFoodConsume` + `SurvivalSystem.eat`; player survives a fed window without starvation. |
| 3 | shelter | An enclosed placed-block shelter around spawn is airtight (interior air cannot reach exterior by flood fill), contains the player, and persists through save/reload. |
| 4 | nether | `validatePortalFrame` returns a valid shape; lighting fills interior with portal blocks; entering teleports to `minecraft:the_nether` (scale `floor(x/8)`); `enter_the_nether` achieved; return linking (×8) works after the 300-tick cooldown. |
| 5 | end | With 12 eyes, `endPortalIsActivated(12)`; teleport lands on the obsidian platform (`endSpawnPosition` = (0.5, 50, 0.5)); dimension `minecraft:the_end`; `enter_the_end` achieved. |
| 6 | boss-complete | Dragon `DEFEATED` (`BossState.status`); `dragonDefeated` true; `DragonCompletionRecord{defeated:true, defeatedTick}` persisted and reloadable; exit portal cells present; `endExitDestination(overworldSpawn)` returns overworld spawn; `free_the_end` achieved; +500 XP reward reflected in experience. |

## Failure modes

- Precondition violation (wrong tool for `miningLevel`, <12 eyes, invalid portal
  frame, teleport under cooldown) → atomic abort, no stage credit, typed
  `ProgressionError` with a stable `code`.
- Step budget exhausted → budget-exceeded result, never success.
- Malformed snapshot/restore input → restore rejected atomically (harness
  unchanged), mirroring `SimulationHarness.restore` and the modules' validated
  deserializers.
- An already-complete advancement re-triggered → no-op (same object), per
  `applyAdvancementTrigger`.
- A defeated boss re-damaged → no-op (framework never revives), no re-fire.

## Compatibility/migration

No stored/public data format changes. The harness round-trips module state only
through their existing versioned snapshot/serialize contracts. Browser
`localStorage` save format is unchanged. No migration.

## Performance/resource constraints

- Each scenario runs under a bounded step budget (`maxSteps`); the full chain is
  a fixed, small script (hundreds of ticks at most, not tens of thousands).
- `stateHash()` is computed once per completed run (O(state) serialization), not
  per tick.
- The in-memory fixture is small (only the edited region and the overworld spawn
  area), so flood-fill enclosure checks are bounded by the fixture bounds.
- No hot path in the shipped game is touched.

## Testing seams

- **Headless harness (authoritative)**: Vitest, `SimulationHarness` semantics +
  in-memory `WorldAccess` fixture + `createNamedRng`. This is where stages 0-6,
  determinism, save/reload, and failure/abort are asserted.
- **Browser E2E (complementary)**: Playwright against the `VITE_E2E` build,
  `window.__voxelGame`, asserting fresh-spawn survival, tool crafting, food
  consumption, and block placement (shelter) through the running game — the
  stages the game already reaches.
- **Determinism seam**: `stateHash()` over serialized progression state; two
  runs with the same `worldSeed` and script must match.

## Observability/debugging

- `stateHash()` gives a single reproducible fingerprint for a run; mismatch
  between runs pinpoints a nondeterminism source.
- Per-stage `isStageComplete` + the ordered advancement `achievedTick` values
  localize which link in the chain broke.
- The browser seam asserts DOM/hook end-state (survival bars, hotbar tool slots,
  `#world-time`, world block reads) so a broken survival-foundation stage is
  visible without logs.

## Affected files/symbols

- New (test-support): `tests/support/ProgressionHarness.ts` (and small fixture
  helpers), plus new spec test files under `tests/unit/` and `tests/e2e/`.
- Read-only consumers (referenced, not modified): `HarvestRules`,
  `FoodComponentRuntime`, `SurvivalSystem`, `ExperienceSystem`, `NetherPortal`,
  `NetherPortalLinking`, `EndPortalProgression`, `EnderDragon`,
  `BossFramework`, `EndExitProgression`, `AdvancementFramework`,
  `CoreProgressionAdvancements`, `DimensionManager`, `SimulationHarness`,
  `SeedRng`, `WorldAccess`, `BlockRegistry`, `ItemRegistry`, `TagRegistry`,
  `BossRegistry`.
- No change to `src/engine/Game.ts` beyond any minimal test-hook exposure already
  gated by `VITE_E2E`; the shipped runtime is otherwise untouched.

## Rejected alternatives

- **Wiring Nether/End/boss into the rendered `Game`** so the browser E2E drives
  the full chain: rejected — large adjacent scope, requires worldgen/rendering
  of two more dimensions, and belongs to a feature change, not an E2E change.
- **Asserting determinism through the browser**: rejected — the running game
  uses `Math.random` (XP jitter, mob spawns), so only structural end-state
  assertions are meaningful there; hash determinism is scoped to the seeded
  harness.
- **Faking the progression modules in the harness**: rejected — the point is
  end-to-end verification of the real modules.
- **Driving through `WorldTickProcess` only**: allowed but not required; the
  spec mandates `SimulationHarness`-style snapshot/restore semantics, and either
  stepper may back the harness.

## Downstream dependencies

- The implementing agent must reconcile these artifacts with the actual
  implementation before marking 242 VERIFIED (`SPEC_AUTHORING_PROTOCOL.md` final
  reconciliation).
- 243 (`redstone-automation-e2e`) is out of scope; no redstone behavior is
  asserted here.
- Program-state files (`PROGRAM_STATE.json`, `PROGRAM_STATE.md`) are updated by
  the implementing agent only after verification evidence is gathered.
