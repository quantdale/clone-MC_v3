# Tasks: 004-block-item-registry-separation

> PLANNED. Implementation begins only after 003 is VERIFIED.

## 1. Entry and characterization
- [x] 1.1 Confirm 003 verification and activate 004 in program state.
- [x] 1.2 Run the full baseline and record results.
- [x] 1.3 Inventory every current numeric definition and classify world-block versus inventory-item meaning.
- [x] 1.4 Add characterization fixtures for current saves and block/item interactions.

## 2. Separate definitions
- [x] 2.1 Add block-only definition type and typed registry.
- [x] 2.2 Add item-only definition type and typed registry.
- [x] 2.3 Register only world-valid blocks in the block registry.
- [x] 2.4 Register all current inventory values in the item registry.
- [x] 2.5 Move tool metadata from block definitions to item definitions.
- [x] 2.6 Move current food metadata to item definitions.
- [x] 2.7 Make block drops reference item identity.
- [x] 2.8 Make placeable items explicitly reference the block they place.
- [x] 2.9 Validate all block/item cross-references during initialization.

## 3. Legacy numeric compatibility
- [x] 3.1 Add explicit current-number to block ResourceId mapping.
- [x] 3.2 Add explicit current-number to item ResourceId mapping.
- [x] 3.3 Add required reverse mappings for unchanged current snapshot export.
- [x] 3.4 Reject duplicate mappings.
- [x] 3.5 Reject/ignore unknown saved values according to current safe validation behavior; never remap them to another valid resource.
- [x] 3.6 Test every currently supported numeric value against its pre-change semantic resource.

## 4. Consumer migration
- [x] 4.1 Migrate world property lookups to block definitions.
- [x] 4.2 Migrate inventory metadata lookups to item definitions.
- [x] 4.3 Migrate crafting metadata resolution without changing recipe behavior.
- [x] 4.4 Migrate mining-speed and item-wear logic to item definitions.
- [x] 4.5 Migrate block drop resolution to item identity.
- [x] 4.6 Migrate placement to the explicit item-to-block link.
- [x] 4.7 Migrate UI item/block name and icon resolution.
- [x] 4.8 Remove now-unused item-only fields from block definitions.

## 5. Compatibility verification
- [x] 5.1 Verify representative old player/inventory saves restore equivalent state.
- [x] 5.2 Verify representative old world edits restore equivalent blocks.
- [x] 5.3 Verify non-placeable items remain non-placeable.
- [x] 5.4 Verify placeable items produce the intended block without numeric-equality inference.
- [x] 5.5 Verify drops resolve to the intended item.
- [x] 5.6 Verify current mining and item-wear behavior remains equivalent.
- [x] 5.7 Verify inventory-only items cannot resolve through block APIs.
- [x] 5.8 Verify generic registry runtime IDs are not persisted as stable save identity.

## 6. Final gate
- [x] 6.1 Reconcile all 004 artifacts with implementation.
- [x] 6.2 Run focused separation/compatibility tests.
- [x] 6.3 Run typecheck.
- [x] 6.4 Run lint.
- [x] 6.5 Run unit tests.
- [x] 6.6 Run build.
- [x] 6.7 Run E2E tests.
- [x] 6.8 Inspect diff for accidental 005+ scope.
- [x] 6.9 Record exact completion and evidence.
- [x] 6.10 Update program state; activate 005 only after VERIFIED.
