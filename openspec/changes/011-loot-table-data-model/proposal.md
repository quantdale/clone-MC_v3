# Proposal: 011-loot-table-data-model

## Problem

Current block breaking directly selects one drop ID and special-cases leaves for an additional item. This does not scale to multiple outputs, quantity ranges, weighted choices, contextual conditions, or future entity/container loot.

## Goals

- Define ResourceId-identified immutable loot tables.
- Define bounded pools and entries that produce item-stack outputs.
- Support fixed quantities and bounded inclusive quantity ranges.
- Support weighted item entries with an injected deterministic random source.
- Define a typed loot context and condition hook without hard-coding future condition catalogs.
- Migrate current block-drop behavior into loot tables while preserving current outputs.
- Validate references, weights, quantities, roll bounds, and output capacity limits before runtime evaluation.

## Non-goals

No full future loot-condition catalog, mob loot catalog, structure chests, enchantment-dependent drops, explosion semantics, or world RNG stream architecture.

## Preconditions

010 is VERIFIED.

## Compatibility

Breaking current blocks MUST produce the same item outputs under equivalent current conditions. Existing saves are unaffected.

## Definition of Done

Loot definitions/evaluation are bounded, deterministic under an injected random source, current block drop special cases are represented through data rather than interaction code, and all focused/full regressions pass.

## Advancement gate

012 starts only after 011 is 100% complete and VERIFIED.
