# Proposal: 005-tag-registry

## Problem

Future game rules need reusable groups such as logs, planks, ores, leaves, replaceable blocks, fuels, and recipe ingredient groups. Hard-coded arrays would duplicate grouping logic and make content additions require code changes.

## Goals

- Add typed tags bound to one generic registry domain.
- Identify tags by ResourceId.
- Support direct resource members and references to other tags in the same domain.
- Resolve nested membership deterministically.
- Detect cycles and missing references.
- Deduplicate repeated/transitive members.
- Provide efficient immutable membership queries after finalization.

## Non-goals

No file-based data loading, gameplay migration, cross-domain membership, hot reload, or networking.

## Preconditions

004 is VERIFIED.

## Compatibility

Additive only. Existing gameplay and saves remain unchanged.

## Definition of Done

Direct and nested tags resolve deterministically, invalid definitions fail without partial finalization, membership queries are efficient, and all focused/full regression checks pass.

## Advancement gate

006 remains blocked until 005 is 100% complete and VERIFIED.
