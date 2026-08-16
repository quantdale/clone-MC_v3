# Proposal: 217-structure-content-expansion

## Problem
215/216 expanded blocks/items/biomes as data; structures remain fixed (099-101). 217 adds
progression-relevant structures through data-driven templates and placement rules — the same
no-new-architecture pattern.

## Goals
- `src/data/StructureExpansion.ts` (NEW), pure and headless-safe:
  - **Definitions**: `StructureDefinition { id, name, template, placement }` where
    `placement = { biomeCategories, spacing, separation, rarity, yRange }` —
    `createStructureDefinition` validates: namespaced ids (path without a `structure/` prefix),
    `name` a non-empty translation key (214), `template` a non-empty template id, non-empty
    `biomeCategories` from 216's `BiomeCategory`, `spacing` a positive integer,
    `separation` an integer in [0, spacing), `rarity` a finite number in (0, 1] (default 1),
    `yRange` a `[min, max]` integer pair with min <= max.
  - **Expansion**: `createStructureExpansion(definitions)` — `StructureExpansion { structures }`
    in registration order with duplicate-id rejection; `structureById(expansion, id)`;
    `structuresInCategory(expansion, category)` — the structures placeable in a biome category
    (registration order).

## Non-goals
- **No template bytes/parsing** (the template id resolves through 099-101's template system),
  **no placement execution** (the placement pipeline consumes the rules), **no registry
  mutation** (099-101 stay untouched with characterization pinned), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 216 (`biome-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers and 216's `BiomeCategory` type (imported; no registry changes).

## Proposed change
1. `src/data/StructureExpansion.ts` (NEW): the definition model, validation, and expansion
   queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Placement-rule drift**. Mitigation: every rule's constraints (spacing/separation order,
  rarity range, yRange order) are pinned in tests with exact messages.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions (defaults + explicit); every rejection; expansion
  grouping/order; duplicates; lookups (by id, by category); empty expansion.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
