# Tasks: 136-mob-goal-selector

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/mob-goal-selector/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Create `src/simulation/GoalSelector.ts`: `GoalFlag`, `Goal`, `GoalSelector`
      (`addGoal`/`removeGoal`/`tick`/`getRunning`/`clear`) per design.md.

- [ ] **3.1** Write `tests/unit/GoalSelector.test.ts`: single eligible goal starts; higher-priority
      interrupts a lower-priority running goal sharing a flag (with call-order verification);
      disjoint-flag goals run simultaneously; `canContinueToUse`/fallback-`canUse` stopping a running
      goal; a stopped goal does not receive `tick()`; `removeGoal`/`clear` behavior.

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
