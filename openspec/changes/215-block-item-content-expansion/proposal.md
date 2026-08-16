# Proposal: 215-block-item-content-expansion

## Problem
The block/item catalog is fixed (004/006); content is added by editing registries. 215 makes
content DATA-DRIVEN: a validated definition layer that expands the catalog's DATA without new
architecture or registry mutations — the pattern 216's biome expansion follows.

## Goals
- `src/data/ContentExpansion.ts` (NEW), pure and headless-safe:
  - **Definitions**: `ContentDefinition { id, kind: block|item, name, stackSize?, hardness?,
    tags? }` — data-driven fields (translation key for 214, stack size, hardness, tags);
    `createContentDefinition` validates: namespaced ids (004 rules, path without a leading
    `block/`/`item/` prefix convention), `name` a non-empty translation key, `stackSize` an
    integer in [1, 64], `hardness` a finite number >= 0, tags non-empty strings, duplicates
    rejected.
  - **Expansion**: `createContentExpansion(definitions)` — the validated catalog expansion as
    `ContentExpansion { blocks, items }` (registration order); `contentById(expansion, id)`
    (undefined when missing); `contentsOfKind(expansion, kind)`.

## Non-goals
- **No registry mutation** (the wiring maps definitions onto the existing registries — 004/006
  stay untouched with their characterization pinned), **no new block behaviors** (the property
  schema covers them), **no rendering assets** (211's manifest), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 214 (`localization-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers (imported; no registry changes).

## Proposed change
1. `src/data/ContentExpansion.ts` (NEW): the definition model, validation, and expansion
   queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Definition-field drift**. Mitigation: every field's constraints (stack size range, hardness,
  tag shape, id convention) are pinned in tests with exact messages.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions (block/item, optional fields, defaults); every rejection
  (id, name, stack size, hardness, tags, duplicates); expansion grouping/order; lookups
  (by id, by kind, empty expansion).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
