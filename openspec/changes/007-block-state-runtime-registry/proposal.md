# Proposal: 007-block-state-runtime-registry

## Problem

A block property schema only defines legal dimensions. Runtime world/render/simulation systems need concrete immutable block states: one block type plus one legal value for every declared property, assigned compact runtime state IDs and a deterministic default state.

## Goals

- Enumerate every legal state combination for each block type from its 006 schema.
- Define and validate one default state per block type.
- Assign dense deterministic `BlockStateId` values for the finalized data set.
- Provide state lookup by block + property values, state ID lookup, property read/change helpers, and canonical debug text.
- Bound state-count explosion and fail configuration that exceeds the documented limit.
- Build the state registry without migrating current world chunk storage yet.

## Non-goals

No section storage migration, no neighbor behavior, no placement-facing logic, no render-model resolution, and no generalized persistence of state IDs.

## Preconditions

006 is VERIFIED with a complete task ledger.

## Compatibility

Current simple blocks with empty schemas produce exactly one state each. Existing world saves/storage remain on the current representation until later changes.

## Definition of Done

State enumeration/defaults/lookups/transitions are deterministic and fully validated, oversized/invalid schemas fail safely, current blocks yield one default state each, and all focused/full regressions pass.

## Advancement gate

008 starts only after 007 is 100% complete and VERIFIED.
