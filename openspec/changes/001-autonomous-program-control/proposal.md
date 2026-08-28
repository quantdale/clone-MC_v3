# Proposal: 001-autonomous-program-control

## Problem

The Minecraft-parity roadmap spans far more work than a single model context or CLI session can safely retain. Without repository-persisted ordering, checkpoints, completion gates, and resume semantics, an autonomous agent can lose its place after context compaction, redo work, skip prerequisites, mark partial work as complete, or begin a later subsystem before an earlier dependency is reliable.

## Goals

- Establish one durable, repository-resident source of truth for the long-running parity program.
- Define strict numbered change ordering and exactly one active implementation change.
- Define a `/goal` continuation loop usable by fresh sessions without prior chat context.
- Define task accounting, mandatory verification, checkpoint frequency, and advancement rules.
- Make 100% completion the normal gate and 90% the absolute exceptional floor.
- Define how future OpenSpec packages are authored before implementation when they have not been pre-expanded.

## Non-goals

- No gameplay, rendering, persistence, world-generation, or engine behavior changes.
- No automation daemon or external scheduler.
- No attempt to implement future parity changes as part of this control change.
- No requirement for a specific CLI product; repository instructions must remain tool-agnostic.

## Preconditions

- The repository contains `MINECRAFT_PARITY_MASTER_PLAN.md`.
- Existing OpenSpec artifacts remain valid historical documentation.
- Agents can read and write repository files and run repository commands in their execution environment.

## Dependencies

None. This is the root dependency for all numbered parity work.

## Proposed change

Add:

- `AGENTS.md` as the first-read agent contract.
- `openspec/AUTONOMOUS_GOAL.md` as the durable `/goal` loop.
- `openspec/PROGRAM_STATE.json` as machine-readable resumable state.
- `openspec/PROGRAM_STATE.md` as its human-readable companion.
- `openspec/CHANGE_SEQUENCE.md` as the strict ordered dependency graph.
- `openspec/SPEC_AUTHORING_PROTOCOL.md` as a just-in-time spec quality gate.
- stricter `openspec/config.yaml` artifact rules.
- this numbered OpenSpec change documenting and verifying the mechanism.

## Compatibility and migration

Existing source, saves, tests, and old OpenSpec changes are not modified semantically. A lowercase `openspec/program-state.json` compatibility pointer may exist for already-written instructions; `openspec/PROGRAM_STATE.json` is canonical.

## Risks

- State can drift from actual code if agents fail to checkpoint; resume logic therefore requires re-verification.
- Two state files could drift; `AGENTS.md` establishes the uppercase file as canonical.
- A percentage-only gate could hide failed mandatory behavior; mandatory requirement/test status overrides percentage.
- Overly broad changes could still defeat context isolation; `SPEC_AUTHORING_PROTOCOL.md` requires narrow scope.

## Rollback strategy

Removing the added control documentation returns the repository to the prior manual workflow and does not alter game data or runtime behavior. Do not roll it back once later numbered changes depend on it.

## Definition of Done

- All control files exist and cross-reference the canonical state/sequence correctly enough for a fresh session to reconstruct the active change.
- The ordered sequence covers the master-plan domains through final verification.
- Advancement rules explicitly require all mandatory requirements and required tests to pass.
- A future absent change spec cannot be implemented before passing a pre-implementation authoring gate.
- `001` is recorded VERIFIED and `002-resource-id-foundation` is active.

## Advancement gate

This change may advance only when its documentation/spec artifacts are internally consistent and no runtime code change is required to achieve its stated goals.
