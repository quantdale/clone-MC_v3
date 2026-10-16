# Proposal: 006-block-property-schema

## Problem

Current blocks have one identity only. Future blocks need state properties such as facing, axis, open, powered, lit, age, moisture, half, layers, and waterlogged.

## Goals

- Define reusable boolean, integer-range, and named-value block properties.
- Validate property names and legal values.
- Preserve deterministic property/value order.
- Parse and serialize values canonically.
- Attach an immutable property schema to block types.
- Allow current blocks to use empty schemas with no gameplay change.

## Non-goals

Block-state expansion/runtime IDs are 007. World storage, placement behavior, rendering resolution, and new content are later changes.

## Preconditions

005 is VERIFIED.

## Compatibility

006 is additive for behavior; existing blocks can have empty property schemas.

## Definition of Done

All property kinds and invalid configurations are tested, schemas are immutable/deterministic, and the full regression gate passes.

## Advancement gate

007 starts only after 006 is 100% complete and VERIFIED.
