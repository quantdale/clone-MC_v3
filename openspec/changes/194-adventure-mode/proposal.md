# Proposal: 194-adventure-mode

## Problem
192 defined modes but no per-mode *interaction* restrictions: every mode can currently break and
place blocks freely. Vanilla adventure mode restricts both to what the held item declares
(`CanDestroy` / `CanPlaceOn` via item components or tags) — that rule is missing.

## Goals
- `src/simulation/AdventureModeRules.ts` (NEW), pure and headless-safe (no world access, no
  mutation):
  - **Break rule**: `canBreakBlock(mode, blockId, allowed)` — survival and creative ALWAYS break;
    spectator NEVER breaks (no interaction); adventure breaks ONLY blocks in `allowed` (the held
    item's `CanDestroy` set, possibly tag-expanded). An item with no declared set breaks nothing
    in adventure.
  - **Place rule**: `canPlaceBlock(mode, blockId, allowed)` — identical shape for `CanPlaceOn`.
  - **Set resolution**: `resolveBlockPermissionSet(directIds, tagIds, lookupTag)` — the union of
    directly-declared block ids and the members of every resolvable tag (unknown tags contribute
    nothing), deduplicated — the "using item components/tags" part, with the tag lookup injected
    as a function so callers can back it with a `TagRegistry` without coupling this module to it.

## Non-goals
- **No new item component in 008's registry** (zero-registry discipline; the wiring reads
  components and passes the declared ids in), **no engine wiring** (later changes apply the
  rules), **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 193 (`hardcore-mode`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 192's `GameMode` (type only). The tag lookup is an injected function; `TagRegistry` itself is
  not imported.

## Proposed change
1. `src/simulation/AdventureModeRules.ts` (NEW): the two permission rules and the set-resolution
   helper.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Empty-set semantics misread**. Mitigation: tests pin that adventure with an empty allowed set
  (item with no declarations) can break/place NOTHING — the vanilla contract.
- **Tag lookup failure handling**. Mitigation: unknown/missing tags contribute nothing and are
  pinned by a test.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the break/place permission table for all four modes (including empty allowed
  sets and the spectator never-interact rule); direct/tag/mixed/deduped/unknown-tag resolution;
  the composed adventure flow (resolved set from tags feeds `canBreakBlock`/`canPlaceBlock`).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
