# Design: 003-generic-registry-core

## Current state

`BlockRegistry` owns two Maps plus an array fast path. That pattern is block-specific and mixes registration with gameplay properties. Future registries need the lookup mechanics without block semantics.

## Target state

A reusable generic registry provides one tested identity/runtime-ID lifecycle. Domain registries compose it rather than reimplementing maps.

## Invariants

1. Every entry has one unique ResourceId.
2. Runtime IDs are integers from 0 through size-1 with no gaps for a finalized registry.
3. For a fixed registration sequence, runtime ID assignment is deterministic.
4. Runtime IDs are process/data-set local and MUST NOT be serialized as stable external identity unless paired with a versioned negotiated mapping in a future change.
5. Duplicate ResourceId registration MUST fail before replacing existing data.
6. After finalize, registration MUST fail and existing entries MUST not change.
7. Lookup by runtime ID MUST be O(1).
8. Lookup by ResourceId/canonical key SHOULD be O(1) average.
9. Iteration order MUST be documented and deterministic; use registration/runtime-ID order.

## Data model

Suggested shape:

```ts
interface RegistryEntry<T> {
  readonly runtimeId: number;
  readonly id: ResourceId;
  readonly value: T;
}

class Registry<T> {
  register(id: ResourceId, value: T): RegistryEntry<T>;
  finalize(): void;
  get(id: ResourceId): T;
  getOptional(id: ResourceId): T | undefined;
  getByRuntimeId(runtimeId: number): T;
  getEntryByRuntimeId(runtimeId: number): RegistryEntry<T>;
  getRuntimeId(id: ResourceId): number;
  entries(): readonly RegistryEntry<T>[];
  get finalized(): boolean;
}
```

Exact API naming may differ. The normative spec controls behavior.

Internals should use:

- `Map<string, RegistryEntry<T>>` keyed by canonical ResourceId text;
- `RegistryEntry<T>[]` indexed by runtime ID;
- optional WeakMap/value map only if a required reverse-value operation genuinely needs object identity. Do not make value-object identity part of the primary contract.

## Lifecycle

### Registration

Validate that registry is mutable and ResourceId is absent. Assign runtime ID equal to current entry count. Append one immutable entry and index it by canonical ResourceId.

### Finalization

Set one-way finalized state. Repeated `finalize()` SHOULD be idempotent rather than destructive. No new entry may be registered afterward.

### Lookup

Missing strict lookups throw a typed/stable registry lookup error or another explicitly documented error category. Optional lookup returns undefined. Out-of-range runtime IDs fail strictly or return undefined only through a separately named optional method.

## Failure modes

- Duplicate registration: fail, preserve original entry and size.
- Register after finalize: fail, preserve registry.
- Negative, fractional, NaN, Infinity, or out-of-range runtime ID: reject.
- Missing ResourceId strict lookup: fail without inserting defaults.
- Repeated finalize: registry remains unchanged.

## Compatibility

No migration of `BlockRegistry` in this change. The generic core can coexist unused by gameplay until 004.

## Performance

- Resource-key lookup average O(1).
- Runtime-ID lookup O(1) direct array indexing.
- Finalization O(1) unless implementation freezes entries/arrays, in which case O(n) is acceptable once.
- Iteration O(n) without sorting.
- No ResourceId parsing in runtime-ID lookup.

## Testing seams

Unit tests should cover empty registry, sequential registration, duplicate conflicts, two independently created equivalent ResourceIds, runtime lookup, missing lookup, invalid runtime IDs, deterministic iteration, finalization, repeated finalize, post-finalize mutation, generic typing, and invariants after failures.

## Affected files

Expected:

- new generic registry module under `src/data/`;
- focused unit tests.

Existing `src/world/BlockRegistry.ts` remains behaviorally untouched.

## Rejected alternatives

- Global singleton: rejected because tests/worlds/data sets need isolation.
- Persisted numeric IDs: rejected because registration sets can change.
- Silent duplicate overwrite: rejected because data conflicts must fail early.
- Sort-on-finalize runtime IDs: rejected for this change because registration order is already deterministic and sorting would add another identity policy. Future loaders can register in deterministic order.

## Downstream dependencies

004 block/item separation is the first production consumer. Tags and every later content registry depend on this core.
