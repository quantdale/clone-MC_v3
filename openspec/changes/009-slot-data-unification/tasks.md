# Tasks: 009-slot-data-unification

> PLANNED. Start only after 008 is VERIFIED.

- [ ] 1. Confirm entry gate and run full baseline.
- [ ] 2. Add characterization tests for current hotbar/storage/snapshot behavior.
- [ ] 3. Define one unified occupied-stack value using item identity, quantity, and component map.
- [ ] 4. Define 9 hotbar plus 27 storage slots with explicit empty state.
- [ ] 5. Migrate selection/cycling to unified hotbar slots.
- [ ] 6. Implement item-specific maximum stack limits.
- [ ] 7. Implement component-aware stack compatibility/merging.
- [ ] 8. Migrate count and capacity queries.
- [ ] 9. Migrate add behavior while preserving current preferred-slot semantics where specified.
- [ ] 10. Migrate remove/payment behavior transactionally.
- [ ] 11. Migrate selected-item consumption and placement lookup.
- [ ] 12. Migrate current per-stack wear behavior to 008 component data.
- [ ] 13. Migrate UI reads to unified stacks.
- [ ] 14. Implement old snapshot import into unified stacks.
- [ ] 15. Preserve old snapshot export shape or document/verify an explicit compatible version transition within 009.
- [ ] 16. Reject malformed snapshot restoration atomically.
- [ ] 17. Test empty/occupied slot invariants and selection normalization.
- [ ] 18. Test merge/no-merge behavior for equal versus differing components.
- [ ] 19. Test add/remove/capacity and full-inventory behavior.
- [ ] 20. Test old snapshot compatibility including current wear state.
- [ ] 21. Test crafting payment, placement consumption, UI, and save/load regressions.
- [ ] 22. Reconcile 009 artifacts and run focused tests.
- [ ] 23. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 24. Inspect scope, record exact evidence/state, and activate 010 only after VERIFIED.
