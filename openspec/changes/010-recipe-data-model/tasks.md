# Tasks: 010-recipe-data-model

> PLANNED. Start only after 009 is VERIFIED.

- [ ] 1. Confirm 009 verification and run baseline.
- [ ] 2. Characterize every current recipe ID, ingredient quantity, output, and capacity behavior.
- [ ] 3. Define namespaced immutable recipe identity/definition.
- [ ] 4. Define exact-item ingredient reference.
- [ ] 5. Define item-tag ingredient reference.
- [ ] 6. Require positive integer ingredient quantities.
- [ ] 7. Define output item identity, quantity, and permitted component data.
- [ ] 8. Validate exact-item and tag references.
- [ ] 9. Validate output identity/component data and quantity.
- [ ] 10. Register/finalize recipes using the generic registry core.
- [ ] 11. Migrate all current recipes to ResourceId-based definitions.
- [ ] 12. Adapt current CraftingSystem to consume the new definition model without grid semantics.
- [ ] 13. Preserve affordability-before-mutation and output-capacity-before-mutation behavior.
- [ ] 14. Test exact-item and tag ingredient matching.
- [ ] 15. Test duplicate/missing/invalid recipe definitions.
- [ ] 16. Test insufficient ingredients and full output capacity leave inventory unchanged.
- [ ] 17. Test every migrated recipe is cost/output equivalent to its characterized behavior.
- [ ] 18. Confirm no 2x2/3x3 grid or recipe file loader is introduced.
- [ ] 19. Reconcile specs and run focused recipe tests.
- [ ] 20. Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 21. Record evidence/state and activate 011 only after VERIFIED.
