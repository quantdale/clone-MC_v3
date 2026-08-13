# Tasks: 004-block-item-registry-separation

> PLANNED. Implementation begins only after 003 is VERIFIED.

## 1. Entry and characterization
- [ ] 1.1 Confirm 003 verification and activate 004 in program state.
- [ ] 1.2 Run the full baseline and record results.
- [ ] 1.3 Inventory every current numeric definition and classify world-block versus inventory-item meaning.
- [ ] 1.4 Add characterization fixtures for current saves and block/item interactions.

## 2. Separate definitions
- [ ] 2.1 Add block-only definition type and typed registry.
- [ ] 2.2 Add item-only definition type and typed registry.
- [ ] 2.3 Register only world-valid blocks in the block registry.
- [ ] 2.4 Register all current inventory values in the item registry.
- [ ] 2.5 Move tool metadata from block definitions to item definitions.
- [ ] 2.6 Move current food metadata to item definitions.
- [ ] 2.7 Make block drops reference item identity.
- [ ] 2.8 Make placeable items explicitly reference the block they place.
- [ ] 2.9 Validate all block/item cross-references during initialization.

## 3. Legacy numeric compatibility
- [ ] 3.1 Add explicit current-number to block ResourceId mapping.
- [ ] 3.2 Add explicit current-number to item ResourceId mapping.
- [ ] 3.3 Add required reverse mappings for unchanged current snapshot export.
- [ ] 3.4 Reject duplicate mappings.
- [ ] 3.5 Reject/ignore unknown saved values according to current safe validation behavior; never remap them to another valid resource.
- [ ] 3.6 Test every currently supported numeric value against its pre-change semantic resource.

## 4. Consumer migration
- [ ] 4.1 Migrate world property lookups to block definitions.
- [ ] 4.2 Migrate inventory metadata lookups to item definitions.
- [ ] 4.3 Migrate crafting metadata resolution without changing recipe behavior.
- [ ] 4.4 Migrate mining-speed and item-wear logic to item definitions.
- [ ] 4.5 Migrate block drop resolution to item identity.
- [ ] 4.6 Migrate placement to the explicit item-to-block link.
- [ ] 4.7 Migrate UI item/block name and icon resolution.
- [ ] 4.8 Remove now-unused item-only fields from block definitions.

## 5. Compatibility verification
- [ ] 5.1 Verify representative old player/inventory saves restore equivalent state.
- [ ] 5.2 Verify representative old world edits restore equivalent blocks.
- [ ] 5.3 Verify non-placeable items remain non-placeable.
- [ ] 5.4 Verify placeable items produce the intended block without numeric-equality inference.
- [ ] 5.5 Verify drops resolve to the intended item.
- [ ] 5.6 Verify current mining and item-wear behavior remains equivalent.
- [ ] 5.7 Verify inventory-only items cannot resolve through block APIs.
- [ ] 5.8 Verify generic registry runtime IDs are not persisted as stable save identity.

## 6. Final gate
- [ ] 6.1 Reconcile all 004 artifacts with implementation.
- [ ] 6.2 Run focused separation/compatibility tests.
- [ ] 6.3 Run typecheck.
- [ ] 6.4 Run lint.
- [ ] 6.5 Run unit tests.
- [ ] 6.6 Run build.
- [ ] 6.7 Run E2E tests.
- [ ] 6.8 Inspect diff for accidental 005+ scope.
- [ ] 6.9 Record exact completion and evidence.
- [ ] 6.10 Update program state; activate 005 only after VERIFIED.
