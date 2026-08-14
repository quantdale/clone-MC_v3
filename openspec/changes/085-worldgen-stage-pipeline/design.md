# Design: 085-worldgen-stage-pipeline

## Context / current state

No worldgen skeleton exists; 086-097 will implement generation stages and need a deterministic
status model to coordinate.

## Target state

`GenerationPipeline` tracks each column's stage through a fixed ordered vocabulary with monotonic,
forward-only transitions and validation.

## Invariants

- Stage order is the `GENERATION_STAGES` array (documented, deterministic).
- `advanceTo(x, z, stage)`: same stage → no-op transition; later stage → advance; earlier stage →
  throws (backward transitions rejected).
- `getStage` defaults to the first stage for unknown columns.
- `isComplete` is true exactly at the final stage.
- Column statuses are independent (no cross-column coupling).

## API and data model

```ts
// src/worldgen/GenerationPipeline.ts (NEW)
export const GENERATION_STAGES = [
  'TERRAIN', 'CLIMATE', 'BIOMES', 'SURFACE', 'CAVES', 'FLUIDS', 'FEATURES', 'FINAL',
] as const;
export type GenerationStageId = (typeof GENERATION_STAGES)[number];
export function stageIndex(stage: GenerationStageId): number;
export function nextStage(stage: GenerationStageId): GenerationStageId | null;
export function validateGenerationStage(input: unknown): GenerationStageId;
export interface GenerationStageTransition {
  columnKey: string;
  from: GenerationStageId;
  to: GenerationStageId;
  advanced: boolean; // false for same-stage no-ops
}
export class GenerationPipeline {
  constructor(stages?: readonly GenerationStageId[]);
  getStage(x: number, z: number): GenerationStageId;
  advanceTo(x: number, z: number, stage: GenerationStageId): GenerationStageTransition;
  isAtLeast(x: number, z: number, stage: GenerationStageId): boolean;
  isComplete(x: number, z: number): boolean;
}
```

## Control / data flow

1. Generation workers (086+) call `advanceTo(x, z, stage)` as each stage completes.
2. Consumers gate work on `isAtLeast(x, z, stage)`.
3. Transitions are recorded for observability and tests.

## Detailed behavior

- Column key: `"x,z"` (deterministic).
- `advanceTo` validates the stage; backward throws `Error` with the column and stages.
- `nextStage` returns null at the final stage.

## Failure modes

- Invalid stage ids and backward transitions throw descriptive errors; no partial state changes.

## Compatibility / migration

Additive; no existing modules touched.

## Performance / resource constraints

O(1) per column (Map-backed).

## Testing seams

- `tests/unit/GenerationPipeline.test.ts` (NEW): vocabulary order/validation; default stage;
  forward advance; same-stage no-op; backward throws; isAtLeast/isComplete; per-column
  independence; determinism.

## Observability / debugging

Transitions record from/to; tests assert exact sequences.

## Affected files / symbols

- `src/worldgen/GenerationPipeline.ts` — NEW.
- `tests/unit/GenerationPipeline.test.ts` — NEW.

## Rejected alternatives

- *Reuse 030 ChunkStatus*: that is the loading lifecycle; generation needs its own stage
  vocabulary aligned with 086-097.
- *Unordered stage set*: the pipeline's determinism depends on the fixed order.

## Downstream dependencies

086-097 implement stage bodies driven by this pipeline; the world wiring advances columns through
it.
