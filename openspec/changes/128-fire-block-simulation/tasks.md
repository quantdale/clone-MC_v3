# Tasks: 128-fire-block-simulation

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/fire-block-simulation/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Add `BlockId.Fire = 36`, `FIRE_SCHEMA` (integer `age` 0..15), and a fire definition in
      `src/world/BlockRegistry.ts` (`minecraft:fire`, non-solid/non-opaque/non-breakable,
      transparent, no `dropItem`, `defaultState { age: 0 }`).

- [x] **3.1** Add `seed?: number` to `BlockBehaviorContext` in `src/simulation/BlockBehavior.ts`
      (additive, optional).

- [x] **4.1** Create `src/simulation/FireBehavior.ts` with the pure helpers (`isFlammable`,
      `parseFireAge`, `canIgnite`, `ignite`, `isAdjacentToWater`, `spreadRoll`, `spreadFire`) and the
      `FireBlockBehavior` class (`onRandomTick` aging/burn/extinguish/spread). Deterministic,
      unit-testable without a full World.

- [x] **5.1** Wire `src/engine/Game.ts`: import/register `FireBlockBehavior` against the fire block
      key and pass `seed: this.seed` in the random-tick `BlockBehaviorContext`; confirm
      `isRandomTickEligible` already admits fire.

- [x] **6.1** Write `tests/unit/FireBehavior.test.ts`: fire block definition + 16-age-state
      enumeration, `isFlammable` set, `ignite` (valid / non-air / unsupported no-op),
      `parseFireAge`, `FireBlockBehavior.onRandomTick` (age sequence, burn at end of life, unsupported
      extinguish, water-adjacent extinguish, bounded spread within the per-tick cap, roll-controlled
      no-spread), and safety (non-fire cell, throwing read, minimal state-less access). 20 tests.

- [x] **6.2** Update existing tests: `BlockItemSeparation.test.ts` row `[36, 'fire', null]`;
      `BlockStateRegistry.test.ts` state-count formula (`- 2 + 8 + 8` → `- 3 + 8 + 8 + 16`) and the
      fire enumeration branch. Also updated two additional pre-existing hard-coded assertions
      discovered during the gate run: `BlockRegistry.test.ts` (`registry.all()` length 24 → 25, plus
      the `Fire`/`fire` row) and `BlockPropertySchema.test.ts` (fire added to the non-empty-schema
      exclusion list alongside wheat/farmland).

- [x] **7.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **8.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
