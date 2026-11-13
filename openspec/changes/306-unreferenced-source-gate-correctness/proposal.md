# Proposal: 306-unreferenced-source-gate-correctness

## Problem

At `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3`, a synthetic Git repository with `src/Dead.ts` and `src/main.ts` containing only `// import { secret } from './Dead';` makes `verify:orphans` exit 0, even though the module has no actual importer. The regular expression counts comments as imports, defeating the gate's stated invariant. This is independently reproduced with the real script, not inferred from the tests.

## Goals

Count actual TypeScript module references rather than comment or string contents; preserve the documented direct-importer contract and reviewed allow-list; demonstrate both negative and positive cases with real executable fixtures. Repair the independently reproduced statistics E2E target-capture race that blocks the mandatory browser gate, without weakening its real-mining assertions.

## Non-goals

No gameplay retune, dependency upgrade, graph reachability/unused-export analysis, or change 258 GPU work. An urgent production save-queue integrity repair is included after a failing deterministic reproduction; this gate checks direct importers, not whether the whole graph is reachable from an entry point.

## Preconditions

Change 305 is VERIFIED, advancement allowed. Starting local and remote main are both `350b557a090b01c2d5d5574fb7ae9aa1e6fc52c3`; worktree clean. Change 258 remains owner-deferred.

## Dependencies

The locked TypeScript compiler, Git and Node; no new packages. Existing 305 gate and tests remain in force.

## Proposed change

Replace regex matching with TypeScript syntax-tree traversal and robust resolution of tracked local modules. Add fixture-driven failure and passing tests. Stabilize the statistics E2E by waiting for the player to land and for targeting to update before capturing a block, while still requiring the captured block to be mined and the statistic to increase. Correct the reproduced data-loss race where an earlier batch write is in flight while a later key is re-marked: the stale batch entry must never delete the newer one. Clarify gate limitations and update durable state and file audit.

## Compatibility and migration

No save, wire, gameplay, public browser or golden changes. A previously hidden orphan may newly fail the gate and must be investigated, not silently allow-listed.

## Risks

Missing an import syntax or misresolving a path can produce false failures or false passes. Explicit fixture cases cover supported syntax and the current real tree; malformed syntax fails closed.

## Rollback strategy

Revert this change's commits together; this restores the previous gate including its known false-pass defect.

## Definition of Done

All normative scenarios pass, including observed red-before/green-after comment case and real-tree gate. Full baseline gate and isolated multiplayer performance gate pass with actual recorded evidence; change state and file-audit manifest are synchronized and published.

## Advancement gate

100% of tasks and all mandatory requirements verified. Change 258 remains BLOCKED without invented hardware evidence.
