# Tasks: 007-block-state-runtime-registry

> PLANNED. Start only after 006 is fully VERIFIED.

- [ ] 1. Confirm 006 gate and run baseline checks.
- [ ] 2. Define immutable BlockState and dense BlockStateId representation.
- [ ] 3. Enumerate empty-schema blocks as one state.
- [ ] 4. Enumerate Cartesian state combinations using deterministic block/property/value order.
- [ ] 5. Add a documented per-block state-count limit and pre-allocation overflow check.
- [ ] 6. Validate and resolve one default state for every block.
- [ ] 7. Implement state-ID to state lookup.
- [ ] 8. Implement state to state-ID/canonical lookup.
- [ ] 9. Implement complete property-assignment lookup.
- [ ] 10. Implement state property reads.
- [ ] 11. Implement immutable property transition to another registered state.
- [ ] 12. Implement deterministic debug serialization.
- [ ] 13. Reject missing/extra/invalid property assignments.
- [ ] 14. Reject invalid default-state configuration.
- [ ] 15. Reject cross-block property transitions.
- [ ] 16. Ensure failed state-registry construction exposes no partial finalized registry.
- [ ] 17. Test state counts for zero, one, and multiple properties.
- [ ] 18. Test deterministic IDs/order across repeated construction.
- [ ] 19. Test default states and lookup round trips.
- [ ] 20. Test immutable transitions and invalid transitions.
- [ ] 21. Test state-count overflow guard.
- [ ] 22. Confirm current world storage/saves are not migrated by 007.
- [ ] 23. Reconcile specs and run focused state tests.
- [ ] 24. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 25. Record evidence/completion and activate 008 only after VERIFIED.
