# Proposal: 002-resource-id-foundation

## Problem

The current codebase identifies blocks with a numeric `BlockId` enum and also carries ad-hoc string keys such as `grass`, `stone`, and recipe IDs. The parity roadmap requires many independent registries—blocks, items, fluids, biomes, entities, recipes, loot tables, tags, sounds, particles, effects, enchantments, attributes, dimensions, structures, and data-pack-like resources. Plain unconstrained strings make duplicate detection, serialization, namespace ownership, validation, and deterministic cross-registry references fragile.

A small namespaced identifier primitive must exist before generic registries are introduced.

## Goals

- Add a canonical immutable `ResourceId` representation for namespaced identifiers.
- Define strict parsing/validation and canonical string serialization.
- Support an explicit default namespace when parsing unqualified paths.
- Make equality/comparison/map-key behavior deterministic.
- Provide exhaustive tests for legal, illegal, boundary, and round-trip cases.
- Introduce the primitive without migrating existing block/item registries yet.

## Non-goals

- No generic registry implementation; that is change 003.
- No separation of blocks and items; that is change 004.
- No tag support; that is change 005.
- No block-state properties, data-pack loading, save-schema migration, or networking.
- No gameplay behavior change and no change to current save formats.

## Preconditions

- Change 001 is VERIFIED.
- Current strict TypeScript baseline builds/tests cleanly before implementation.

## Dependencies

- 001-autonomous-program-control.
- Standard TypeScript/JavaScript only; no new package is required.

## Proposed change

Create a small `src/data/ResourceId.ts` module (or an equivalently narrow data namespace) containing:

- `ResourceId` type/value representation;
- parse/try-parse/create helpers;
- canonical `namespace:path` string conversion;
- validation helpers/constants;
- deterministic lexical comparison when ordering is required;
- explicit validation errors or result type.

Recommended syntax:

- Namespace allowed characters: lowercase ASCII `a-z`, digits `0-9`, `_`, `-`, `.`.
- Path allowed characters: namespace characters plus `/`.
- Namespace and path are non-empty.
- Whitespace and uppercase characters are rejected rather than silently normalized.
- Exactly one logical namespace separator is parsed: split on the first `:` and validate that the path itself contains no `:`.
- Unqualified input is accepted only when the caller supplies an explicit default namespace.
- Canonical output is always `namespace:path`.

## Compatibility and migration

This change is additive. Existing `BlockId`, block string keys, recipe IDs, save data, localStorage keys, and gameplay APIs remain unchanged. Change 003 will consume `ResourceId`; later changes perform controlled migrations.

## Risks

- Overly permissive parsing would create identifiers that future data loaders cannot safely resolve.
- Silent lowercase normalization could hide authoring mistakes and create collisions; reject instead.
- A class-heavy representation could create unnecessary allocations in hot paths; resource IDs are primarily data-boundary keys, while later registries use compact numeric runtime IDs.
- Accidentally migrating existing IDs in this change would broaden scope and make rollback harder.

## Rollback strategy

Because the change is additive and not yet a persistence boundary, removal of the new module/tests fully rolls it back.

## Definition of Done

- `ResourceId` has a single documented canonical syntax.
- All parser/constructor paths enforce the same validation rules.
- Qualified and explicit-default-namespace inputs round-trip deterministically.
- Invalid identifiers fail predictably without partial state.
- Unit tests cover legal character sets, empty fields, separators, whitespace, uppercase characters, invalid characters, default-namespace behavior, equality/comparison, and round-trip serialization.
- Existing gameplay behavior and save snapshots are unchanged.
- Typecheck, lint, unit suite, build, and required E2E regression suite pass.

## Advancement gate

003 MUST NOT begin until all 002 MUST/SHALL requirements and required checks pass. Target completion is 100%; no expected task in this foundational change is intentionally optional.
