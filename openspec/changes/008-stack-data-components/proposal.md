# Proposal: 008-stack-data-components

## Problem

Current item-specific state is hard-coded as a separate durability array. Future inventory objects need extensible per-stack data without adding one parallel field for every feature.

## Goals

- Define typed stack-data component types identified by ResourceId.
- Register component types through the generic registry core.
- Provide an immutable component map for one inventory stack.
- Define validation, equality, copying, replacement/removal, and deterministic iteration.
- Add a basic damage/wear component for current tools, without migrating Inventory yet.

## Non-goals

Inventory migration is 009. Enchantments, potion data, generic save codecs, and networking remain later work.

## Preconditions

007 is VERIFIED.

## Compatibility

008 is additive. Existing inventory arrays and snapshots remain unchanged.

## Definition of Done

Component registration/maps and invalid-value behavior are fully tested, deterministic, immutable, and regression-safe.

## Advancement gate

009 starts only after 008 is 100% complete and VERIFIED.
