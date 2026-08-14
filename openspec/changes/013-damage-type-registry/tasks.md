# Tasks: 013-damage-type-registry

> VERIFIED. 18/18 complete (100%). Implemented, tested, and gated.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Define `DamageTypeFlag` set and `DamageTypeKind`.
- [x] 3. Define `DamageTypeDefinition` (id, key, name, flags, kind, amount, interval, fallThreshold, fallScaling).
- [x] 4. Build `DamageTypeRegistry` on the 003 generic `Registry` with validation + finalize.
- [x] 5. Validate finite non-negative params, kind-required fields, known flags, unique ids.
- [x] 6. Provide `createDefaultDamageTypeRegistry()` with fall/drowning/lava/starvation defaults.
- [x] 7. Wire `SurvivalSystem` to accept an optional registry and resolve the four default types.
- [x] 8. Route fall damage through the fall type (threshold/scaling).
- [x] 9. Route drowning/lava through periodic types (interval/amount).
- [x] 10. Route starvation through the starvation type amount.
- [x] 11. Fail fast if a required default key is missing.
- [x] 12. Test registry validation and error paths.
- [x] 13. Test the four default types and flag sets.
- [x] 14. Test fall formula, periodic ticking, and preservation of current semantics.
- [x] 15. Confirm existing `SurvivalSystem.test.ts` still pins exact drow/lava/fall numbers.
- [x] 16. Reconcile specs and run focused tests.
- [x] 17. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 18. Record evidence/state and activate 014 only after VERIFIED.
