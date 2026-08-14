# Tasks: 007-block-state-runtime-registry

> VERIFIED. All 25 tasks complete; full gate green.

- [x] 1. Confirm 006 gate and run baseline checks.
- [x] 2. Define immutable BlockState and dense BlockStateId representation.
- [x] 3. Enumerate empty-schema blocks as one state.
- [x] 4. Enumerate Cartesian state combinations using deterministic block/property/value order.
- [x] 5. Add a documented per-block state-count limit and pre-allocation overflow check.
- [x] 6. Validate and resolve one default state for every block.
- [x] 7. Implement state-ID to state lookup.
- [x] 8. Implement state to state-ID/canonical lookup.
- [x] 9. Implement complete property-assignment lookup.
- [x] 10. Implement state property reads.
- [x] 11. Implement immutable property transition to another registered state.
- [x] 12. Implement deterministic debug serialization.
- [x] 13. Reject missing/extra/invalid property assignments.
- [x] 14. Reject invalid default-state configuration.
- [x] 15. Reject cross-block property transitions.
- [x] 16. Ensure failed state-registry construction exposes no partial finalized registry.
- [x] 17. Test state counts for zero, one, and multiple properties.
- [x] 18. Test deterministic IDs/order across repeated construction.
- [x] 19. Test default states and lookup round trips.
- [x] 20. Test immutable transitions and invalid transitions.
- [x] 21. Test state-count overflow guard.
- [x] 22. Confirm current world storage/saves are not migrated by 007.
- [x] 23. Reconcile specs and run focused state tests.
- [x] 24. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 25. Record evidence/completion and activate 008 only after VERIFIED.
