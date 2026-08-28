/**
 * Worldgen stage pipeline (085). `GenerationPipeline` tracks each column's generation stage
 * through a fixed ordered stage vocabulary (default: `GENERATION_STAGES`) with monotonic
 * forward-only transitions: `advanceTo` advances to later stages, treats same-stage calls as
 * no-ops, and throws on backward transitions. Unknown columns default to the first stage;
 * `isComplete` is true exactly at the final stage. Column statuses are independent; all behavior
 * is deterministic.
 */
export const GENERATION_STAGES = [
  'TERRAIN',
  'CLIMATE',
  'BIOMES',
  'SURFACE',
  'CAVES',
  'FLUIDS',
  'FEATURES',
  'FINAL',
] as const;

/** A generation stage id from the default vocabulary. */
export type GenerationStageId = (typeof GENERATION_STAGES)[number];

const STAGE_SET: ReadonlySet<string> = new Set(GENERATION_STAGES);

/** The 0-based index of a stage in the default vocabulary. */
export function stageIndex(stage: GenerationStageId): number {
  return GENERATION_STAGES.indexOf(stage);
}

/** The next default-vocabulary stage after `stage`, or null at the final stage. */
export function nextStage(stage: GenerationStageId): GenerationStageId | null {
  const index = stageIndex(stage);
  return index + 1 < GENERATION_STAGES.length ? GENERATION_STAGES[index + 1]! : null;
}

/** Validate an unknown value as a default-vocabulary stage id. */
export function validateGenerationStage(input: unknown): GenerationStageId {
  if (typeof input !== 'string' || !STAGE_SET.has(input)) {
    throw new Error(`GenerationPipeline: unknown generation stage: ${String(input)}`);
  }
  return input as GenerationStageId;
}

/** One column's stage transition record. */
export interface GenerationStageTransition<S extends string = GenerationStageId> {
  columnKey: string;
  from: S;
  to: S;
  /** False for same-stage no-ops. */
  advanced: boolean;
}

/** Per-column generation stage status over an ordered vocabulary (forward-only, deterministic). */
export class GenerationPipeline<S extends string = GenerationStageId> {
  private readonly stages: readonly S[];
  private readonly status = new Map<string, S>();

  constructor(stages?: readonly S[]) {
    this.stages = stages ?? (GENERATION_STAGES as unknown as readonly S[]);
  }

  private key(x: number, z: number): string {
    return `${x},${z}`;
  }

  private validateStage(input: unknown): S {
    if (typeof input !== 'string' || !(this.stages as readonly string[]).includes(input)) {
      throw new Error(`GenerationPipeline: unknown generation stage: ${String(input)}`);
    }
    return input as S;
  }

  /** The current stage of the column; the first stage for unknown columns. */
  getStage(x: number, z: number): S {
    return this.status.get(this.key(x, z)) ?? this.stages[0]!;
  }

  /**
   * Advance the column's stage. Forward advances record an `advanced: true` transition; same-stage
   * calls record `advanced: false`; backward transitions throw and change nothing.
   */
  advanceTo(x: number, z: number, stage: S): GenerationStageTransition<S> {
    const key = this.key(x, z);
    const from = this.getStage(x, z);
    const to = this.validateStage(stage);
    const fromIndex = this.stages.indexOf(from);
    const toIndex = this.stages.indexOf(to);
    if (toIndex < fromIndex) {
      throw new Error(`GenerationPipeline: cannot move ${key} backward from ${from} to ${to}`);
    }
    if (toIndex > fromIndex) {
      this.status.set(key, to);
      return { columnKey: key, from, to, advanced: true };
    }
    return { columnKey: key, from, to, advanced: false };
  }

  /** Whether the column reached (or passed) `stage`. */
  isAtLeast(x: number, z: number, stage: S): boolean {
    return this.stages.indexOf(this.getStage(x, z)) >= this.stages.indexOf(this.validateStage(stage));
  }

  /** Whether the column completed the final stage. */
  isComplete(x: number, z: number): boolean {
    return this.getStage(x, z) === this.stages[this.stages.length - 1];
  }
}
