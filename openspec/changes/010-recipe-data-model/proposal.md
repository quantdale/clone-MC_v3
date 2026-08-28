# Proposal: 010-recipe-data-model

Current recipes use plain string IDs and numeric ingredient/output tuples. Replace the definition layer with namespaced recipe ResourceIds and typed item/tag references while preserving current crafting behavior.

Goals:

- registry-backed recipe identity;
- exact-item or item-tag ingredient references with positive quantities;
- item output identity, quantity, and permitted stack component data;
- validation of every item/tag reference;
- immutable finalized definitions;
- migration of the current recipe catalog without changing costs, outputs, capacity checks, or transaction behavior.

Grid matching, file loading, furnace processing, and recipe-book UX are later changes.

010 begins only after 009 is VERIFIED and must reach 100% before 011 starts.
