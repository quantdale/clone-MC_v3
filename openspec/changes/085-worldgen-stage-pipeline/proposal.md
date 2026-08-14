# Proposal: 085-worldgen-stage-pipeline

## Problem

World generation (086-097) needs an explicit, deterministic skeleton: a fixed stage vocabulary and
per-column status transitions. Without it, stage implementations cannot coordinate or be tested
independently.

## Goals

- A documented, ordered `GENERATION_STAGES` vocabulary covering the upcoming worldgen pipeline
  (terrain → climate → biomes → surface → caves → fluids → features → final).
- `GenerationPipeline`: per-column monotonic stage status with strict forward-only transitions,
  transition records, and validation — deterministic and testable scaffolding for 086+.

## Non-goals

- Stage implementations (086-097 deliver them).
- Chunk loading status (030 `ChunkStatus` remains the loading lifecycle; this is the generation
  pipeline).
- Persistence (world persistence of generated chunks is a later concern).

## Preconditions

- Change 084 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 084 baseline (954 unit / 19 e2e).

## Dependencies

- 003 registry patterns; 030 monotonic status semantics (reference shape).

## Proposed change

- `src/worldgen/GenerationPipeline.ts` (NEW): `GENERATION_STAGES`, `GenerationStageId`,
  `stageIndex`, `nextStage`, `validateGenerationStage`, `GenerationStageTransition`,
  `GenerationPipeline` (`getStage`, `advanceTo`, `isComplete`, `isAtLeast`).
- `tests/unit/GenerationPipeline.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- The vocabulary must match the real stage order delivered by 086-097; the ordered array is the
  single source of truth and is amendable in later changes.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Stage vocabulary is ordered and validated (unknown ids rejected).
- `advanceTo` is forward-only: same-stage is a no-op transition, forward advances, backward throws.
- Per-column status is independent and deterministic; `isComplete` true only at the final stage.
- Transition records capture from/to stages.
- Full gate green; 085 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 085 suite; E2E stays 19/19.
