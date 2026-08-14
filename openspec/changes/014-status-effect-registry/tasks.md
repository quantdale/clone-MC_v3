# Tasks: 014-status-effect-registry

> VERIFIED. 17/17 complete (100%). Implemented, tested, and gated.

- [x] 1. Confirm entry gate and run baseline.
- [x] 2. Define `StatusEffectCategory` and `StatusEffectFlag`.
- [x] 3. Define `StatusEffectTypeDefinition` (id, key, name, category, flags, durations, maxAmplifier).
- [x] 4. Build `StatusEffectTypeRegistry` on the 003 generic `Registry` with validation + finalize.
- [x] 5. Validate finite non-negative durations, amplifier bounds, known flags, valid category, unique ids.
- [x] 6. Provide `createDefaultStatusEffectRegistry()` with common effect types (no gameplay).
- [x] 7. Define serializable `StatusEffectInstance` (type, duration, amplifier).
- [x] 8. Implement deterministic ticking and expiry.
- [x] 9. Implement serialize/deserialize round-trip with unregistered-id rejection.
- [x] 10. Test registry validation and error paths.
- [x] 11. Test default registry contents and flags.
- [x] 12. Test instance duration defaulting and amplifier clamping.
- [x] 13. Test ticking and expiry.
- [x] 14. Test serialize/deserialize round-trip and unregistered rejection.
- [x] 15. Reconcile specs and run focused tests.
- [x] 16. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 17. Record evidence/state and activate 015 only after VERIFIED.
