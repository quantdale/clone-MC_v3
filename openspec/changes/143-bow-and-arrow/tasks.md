# Tasks: 143-bow-and-arrow

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/bow-and-arrow/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/BowAndArrow.ts`: constants
      (`DEFAULT_ARROW_SPEED`/`DEFAULT_ARROW_BASE_DAMAGE`/`DEFAULT_PICKUP_DELAY_TICKS`/
      `DEFAULT_PICKUP_RADIUS`), `bowPullProgress`, `computeArrowSpeed`, `computeFireVelocity`,
      `computeArrowDamage`, `canFireBow`, `LandedArrow`, `LandedArrowTracker` per design.md.

- [x] **3.1** Write `tests/unit/BowAndArrow.test.ts`: charge-curve reference points (0/20/beyond);
      fire-velocity magnitude/direction plus the zero-length-direction case; damage
      non-negativity/monotonicity; `canFireBow`'s ammo gate (with and without infinite ammo);
      `LandedArrowTracker`'s add/get/remove/clear plus `collectNearby`'s delay-gate, radius-gate, and
      removal-on-collection behavior. 15 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
