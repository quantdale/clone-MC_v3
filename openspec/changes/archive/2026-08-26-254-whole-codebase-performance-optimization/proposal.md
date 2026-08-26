# Proposal: 254-whole-codebase-performance-optimization

## Problem

The numbered program 001–252 is COMPLETE/VERIFIED. The product owner has explicitly
authorized a repository-wide performance-optimization campaign (session instruction of
2026-08-26). Code-level inspection of the live engine identified one systemic bottleneck
cluster plus several secondary hot-path inefficiencies, all on paths executed thousands to
millions of times per second:

1. **Voxel access allocation churn.** `World.getBlock` (the single hottest function in the
   engine — physics collision, raycasts, light BFS, meshing samplers, random ticks, mob AI
   all route through it) allocates two coordinate tuples and builds a string chunk key for
   `ChunkManager.getChunk`'s string-keyed map on **every call**.
2. **Light storage per-cell allocations.** Every `WorldLightStorage` cell access builds the
   section key string for its cache comparison, and every `SectionLightStorage` accessor
   allocates a `{localX,localY,localZ}` object before indexing. Light propagation touches
   thousands of cells per edit drain; mesher shading samples four corners × two channels
   per emitted face.
3. **Random-tick selection overhead.** `hash32(...values)` allocates a rest-args array per
   call and `selectEligible` allocates a `LocalCoord` object per attempt. With up to 768
   bounded attempts per section across ~676 simulating sections at 20 TPS this is up to
   ~10M allocations/second of pure garbage, plus two registry lookups (block → key →
   behavior) per eligibility probe.

Secondary: `PlayerPhysics.shapeWorld` performs two full world lookups (`isSolid` then
`getBlock`) per collision cell; HUD chips rewrite identical `textContent` every frame/tick.

## Goals

- Eliminate per-call/per-cell allocations on the named hot paths without changing any
  observable behavior (results, determinism, error classes/messages).
- Reduce random-tick selection CPU cost with bit-identical selection sequences.
- Add a durable micro-benchmark suite (`vitest bench`) covering the optimized paths so the
  improvement is measurable and future regressions are visible.
- Hold the full repository gate green: typecheck, lint, unit, build, e2e.

## Non-goals

- No new gameplay content, no dimension-model convergence (Change 253 remains reserved,
  PLANNED, untouched), no storage-format changes, no public API removals or signature
  changes, no worker-meshing enablement, no budget/config retuning.

## Preconditions

- Program state terminal/COMPLETE at session start head `d258414614681116c5cf2c86bb7d95a3577a34bb`.
- Working tree clean; origin/main == HEAD at session start.
- Full baseline gate green (recorded in verification.md before implementation).

## Dependencies

- None outside the repository. Uses only existing toolchain (vitest bench).

## Proposed change

Six narrowly-scoped optimizations (A–F) over live engine hot paths, each preserving exact
behavior, plus a benchmark suite and targeted regression tests. See design.md and
specs/engine-hot-paths/spec.md.

## Compatibility and migration

None required. No stored data, network protocol, or public API changes. All existing tests
must pass unmodified except where they assert internal allocation behavior (none known).

## Risks

- Memo/cache staleness returning wrong blocks after chunk unload/reload — mitigated by a
  revision-guarded memo and dedicated invalidation tests.
- Determinism drift in random-tick selection — mitigated by golden-equivalence tests
  comparing old/new hash outputs and full selectEligible sequences.
- Validation-semantics drift in light storage (missing RangeError) — mitigated by
  boundary/negative/fractional input tests pinning exact messages.

## Rollback strategy

Each optimization is an independent commit-sized unit over isolated files; reverting the
change restores prior behavior. No data migrations exist to undo.

## Definition of Done

All spec requirements verified with evidence; benchmarks recorded before/after; full gate
PASS; program state reconciled; work published to origin/main.

## Advancement gate

Target 100% tasks. Baseline floor 90% per AGENTS.md; no exception anticipated.
