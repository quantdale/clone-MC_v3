# Tasks: 009-slot-data-unification

> VERIFIED. 008 is VERIFIED.

- [x] 1. Confirm entry gate and run full baseline.
- [x] 2. Add characterization tests for current hotbar/storage/snapshot behavior.
- [x] 3. Define one unified occupied-stack value using item identity, quantity, and component map.
- [x] 4. Define 9 hotbar plus 27 storage slots with explicit empty state.
- [x] 5. Migrate selection/cycling to unified hotbar slots.
- [x] 6. Implement item-specific maximum stack limits.
- [x] 7. Implement component-aware stack compatibility/merging.
- [x] 8. Migrate count and capacity queries.
- [x] 9. Migrate add behavior while preserving current preferred-slot semantics where specified.
- [x] 10. Migrate remove/payment behavior transactionally.
- [x] 11. Migrate selected-item consumption and placement lookup.
- [x] 12. Migrate current per-stack wear behavior to 008 component data.
- [x] 13. Migrate UI reads to unified stacks.
- [x] 14. Implement old snapshot import into unified stacks.
- [x] 15. Preserve old snapshot export shape or document/verify an explicit compatible version transition within 009.
- [x] 16. Reject malformed snapshot restoration atomically.
- [x] 17. Test empty/occupied slot invariants and selection normalization.
- [x] 18. Test merge/no-merge behavior for equal versus differing components.
- [x] 19. Test add/remove/capacity and full-inventory behavior.
- [x] 20. Test old snapshot compatibility including current wear state.
- [x] 21. Test crafting payment, placement consumption, UI, and save/load regressions.
- [x] 22. Reconcile 009 artifacts and run focused tests.
- [x] 23. Run typecheck, lint, full unit tests, build, and E2E.
- [x] 24. Inspect scope, record exact evidence/state, and activate 010 only after VERIFIED.
