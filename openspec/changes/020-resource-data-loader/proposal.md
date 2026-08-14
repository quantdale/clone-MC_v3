# Proposal: 020-resource-data-loader

## Problem

Loaded game data (registries, codec payloads) has no shared, deterministic loading/validation step.
Callers read ad-hoc files and trust their shape, so a missing, malformed, or version-incompatible
data file either crashes or silently poisons runtime state, and the set of loaded resources is not
reproducible.

## Goals

- Provide a deterministic `ResourceDataLoader` that reads named data files through an injected
  reader and decodes each with a `VersionedCodec` (019).
- Collect per-file load errors/warnings without aborting the whole batch; produce a stable
  `LoadedResource` result.
- Reproducibly build a 003 `Registry` from successfully loaded values keyed by 002 `ResourceId`.
- Keep the loader source-agnostic (filesystem, fetch, in-memory) via an injected reader.

## Non-goals

- No fetching from remote URLs or handling of proprietary game assets (only original/procedural).
- No game schema; the loader is the reusable primitive.

## Preconditions

019 is VERIFIED. Depends on 002 `ResourceId`, 003 `Registry`, and 019 `VersionedCodec`.

## Dependencies

- `src/data/ResourceId.ts` (002)
- `src/data/Registry.ts` (003)
- `src/data/VersionedCodec.ts` (019)

## Proposed change

Add `src/data/ResourceDataLoader.ts` with `ResourceDataLoader`, `LoadedResource`, error/warning
accumulation, and `loadIntoRegistry` (keyed by `ResourceId`). Gameplay-free and consumer-free.

## Compatibility and migration

No existing code or persisted data changes. Purely additive infrastructure.

## Risks

- Over-scoping into concrete asset catalogs. Mitigated by the explicit non-goal of no game schema.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact.

## Definition of Done

Deterministic loader, error collection, registry build, and tests are complete; full regression gate
is green.

## Advancement gate

021 starts only after 020 is 100% complete and VERIFIED.
