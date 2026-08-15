# Tasks: 139-passive-wander-ai

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/passive-wander-ai/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/PassiveWanderAI.ts`: `WanderGoal` (`canUse`/`canContinueToUse`/
      `start`/`tick`/`stop`, bounded non-water/standable target search, horizontal steering,
      arrival/timeout stop) and `LookGoal` (`canUse`/`tick`, random-yaw filler) per design.md.

- [x] **3.1** Write `tests/unit/PassiveWanderAI.test.ts`: `WanderGoal` never selecting a water
      target / always succeeding on an open area; steering `tick()` (vy untouched); arrival stopping
      continuation and zeroing horizontal velocity on `stop()`; `maxDurationTicks` timeout;
      `LookGoal`'s below/at-threshold yaw-change cases; determinism across two identically-seeded
      instances. 9 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
