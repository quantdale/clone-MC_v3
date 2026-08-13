# Proposal: 003-generic-registry-core

## Problem

Future parity systems need many registries with the same correctness properties: stable namespaced identity, compact runtime lookup, duplicate rejection, deterministic iteration, and immutable finalized state. Implementing one-off maps for blocks, items, fluids, biomes, entities, recipes, tags, and effects would duplicate logic and produce inconsistent failure behavior.

## Goals

- Add a generic typed registry primitive keyed by the `ResourceId` contract from 002.
- Assign dense numeric runtime IDs deterministically during registration/finalization.
- Support lookup by ResourceId, canonical text, and runtime ID without repeated parsing in hot paths.
- Reject duplicate logical identifiers before they can overwrite data.
- Finalize/freeze a registry so later mutation fails predictably.
- Provide deterministic iteration and reverse lookup.
- Keep current `BlockRegistry` untouched until 004.

## Non-goals

- No block/item separation or migration.
- No tags, aliases, overrides, data-pack loading, hot reload, or registry synchronization over a network.
- Runtime IDs are not persistent save IDs and are not promised stable across different data sets.
- No global singleton registry manager yet.

## Preconditions

- 002-resource-id-foundation is VERIFIED.

## Dependencies

- `ResourceId` parser/value/serialization/equality contract from 002.

## Proposed change

Introduce a generic registry module with explicit build/finalization lifecycle. A registration associates one ResourceId with one typed value and receives a dense runtime integer ID. After finalization, lookups and iteration remain available while registration/mutation is forbidden.

Required capabilities:

- duplicate ResourceId detection;
- dense non-negative runtime IDs;
- ID → value and value metadata retrieval;
- ResourceId → value/runtime ID lookup;
- deterministic registration-order iteration;
- immutable/finalized lifecycle;
- explicit missing-entry behavior;
- no accidental use of locale-sensitive ordering.

## Compatibility and migration

Additive only. Existing `BlockRegistry` and gameplay remain unchanged in 003.

## Risks

- Treating runtime IDs as persistent identifiers would corrupt future saves when data ordering changes; design must explicitly prohibit this.
- Allowing mutation after systems cache numeric IDs would create mismatched references.
- Silent duplicate overwrite would hide authored data conflicts.
- Parsing canonical strings during hot lookup would defeat the runtime-ID purpose; parse only at data boundaries.

## Rollback strategy

Remove the generic registry module/tests. No current production registry depends on it until 004.

## Definition of Done

- Generic registry lifecycle and lookup contracts are implemented and tested.
- Duplicate/missing/finalized-mutation cases have deterministic behavior.
- Runtime IDs are dense and deterministic for a given registration order.
- Iteration/reverse lookup are deterministic.
- Existing game behavior and saves are unchanged.
- Full repository regression gate passes.

## Advancement gate

004 cannot begin until 003 is 100% complete and VERIFIED; no foundational task is intentionally optional.
