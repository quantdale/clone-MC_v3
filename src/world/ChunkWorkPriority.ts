import { ChunkStreamPriority } from './ChunkTicket';

/** Deterministic priority tuple for bounded streaming work; lower values dispatch first. */
export interface ChunkWorkPriority {
  /** Coarse work urgency, normally derived from the active streaming ticket/ring. */
  readonly urgency: ChunkStreamPriority;
  /** Approximate frustum/visibility score; 0 is most visible. */
  readonly visibility: number;
  /** Movement-direction score; lower values are closer to the current travel direction. */
  readonly movement: number;
  /** Simulation-ticket score; 0 means inside the active simulation radius. */
  readonly simulation: number;
  /** Presentation LOD level; LOD0 is preferred for interactive work. */
  readonly lod: number;
  /** Chebyshev distance from the stream center. */
  readonly distance: number;
}

function assertFiniteInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`ChunkWorkPriority: ${name} must be a finite integer`);
  }
}

/** Construct and validate a streaming priority tuple. */
export function createChunkWorkPriority(
  urgency: ChunkStreamPriority,
  visibility: number,
  movement: number,
  simulation: number,
  lod: number,
  distance: number,
): ChunkWorkPriority {
  assertFiniteInteger(urgency, 'urgency');
  assertFiniteInteger(visibility, 'visibility');
  assertFiniteInteger(movement, 'movement');
  assertFiniteInteger(simulation, 'simulation');
  assertFiniteInteger(lod, 'lod');
  assertFiniteInteger(distance, 'distance');
  if (visibility < 0 || simulation < 0 || lod < 0 || distance < 0) {
    throw new RangeError('ChunkWorkPriority: visibility, simulation, lod, and distance must be non-negative');
  }
  return Object.freeze({ urgency, visibility, movement, simulation, lod, distance });
}

/** Compare the priority tuple without age or coordinate tie-breaks. */
export function compareChunkWorkPriority(a: ChunkWorkPriority, b: ChunkWorkPriority): number {
  return (
    a.urgency - b.urgency ||
    a.visibility - b.visibility ||
    a.movement - b.movement ||
    a.simulation - b.simulation ||
    a.lod - b.lod ||
    a.distance - b.distance
  );
}

/** Compare canonical chunk coordinates for the final deterministic tie-break. */
export function compareChunkCoordinates(
  a: Pick<ChunkWorkCoordinates, 'cx' | 'cy' | 'cz'>,
  b: Pick<ChunkWorkCoordinates, 'cx' | 'cy' | 'cz'>,
): number {
  return a.cx - b.cx || a.cy - b.cy || a.cz - b.cz;
}

/** Coordinate shape used by the queue comparator. */
export interface ChunkWorkCoordinates {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
}

/** Compare queued work, including age and canonical coordinates after the priority tuple. */
export function compareChunkWork(
  a: ChunkWorkCoordinates & { priorityDetails: ChunkWorkPriority; enqueuedAtMs: number },
  b: ChunkWorkCoordinates & { priorityDetails: ChunkWorkPriority; enqueuedAtMs: number },
): number {
  return (
    compareChunkWorkPriority(a.priorityDetails, b.priorityDetails) ||
    a.enqueuedAtMs - b.enqueuedAtMs ||
    compareChunkCoordinates(a, b)
  );
}
