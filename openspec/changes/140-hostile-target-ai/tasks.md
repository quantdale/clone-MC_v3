# Tasks: 140-hostile-target-ai

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/hostile-target-ai/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Create `src/simulation/HostileTargetAI.ts`: `TargetAcquisitionGoal`
      (`canUse`/`canContinueToUse`/`start`/`stop`/`getTarget`, detection/forget radius hysteresis)
      and `ChaseGoal` (`canUse`/`canContinueToUse`/`tick`/`stop`, dependent on
      `TargetAcquisitionGoal.getTarget()`, steer/stop-in-range) per design.md.

- [ ] **3.1** Write `tests/unit/HostileTargetAI.test.ts`: acquisition within/beyond detection
      radius; continued tracking of a moving-but-in-range target; dropping on out-of-forget-range or
      a `null` callback; `ChaseGoal` requiring an acquired target; steering vs. in-range stop
      (`vy` untouched in both); determinism across two identically-configured instances.

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
