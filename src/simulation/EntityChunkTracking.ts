/**
 * Chunk-scoped entity activation/deactivation and ticking-set selection (132).
 *
 * `selectTickingEntities` filters a 129 `EntityManager`'s live entities down to
 * those whose current chunk satisfies a caller-supplied predicate — decoupled
 * from both `ChunkTicketManager` (031) and `RenderSimulationDistance` (032) on
 * purpose, since either (or neither) may back the predicate. `deactivateChunk`/
 * `activateChunk` compose 131's `serializeChunk`/`deserializeChunk` with the
 * new `EntityManager.forgetChunk` into the named "unload"/"load" operations.
 * No `Game`/persistence-repository wiring and no automatic chunk-diffing loop
 * are in scope — see the proposal's Non-goals.
 */
import { sectionIndex } from '../math/SectionCoordinate';
import type { SerializedEntity } from '../storage/EntityRecord';
import type { EntityInstance } from '../world/Entity';
import type { EntityManager } from './EntityManager';

/**
 * The `ACTIVE` entities in `manager` whose current chunk satisfies
 * `isChunkTicking(cx, cz)`, in `getAll()`'s insertion order. Pure: never
 * mutates the manager. A throwing predicate propagates (not caught).
 */
export function selectTickingEntities(
  manager: EntityManager,
  isChunkTicking: (cx: number, cz: number) => boolean,
): EntityInstance[] {
  return manager
    .getAll()
    .filter((e) => isChunkTicking(sectionIndex(e.transform.x), sectionIndex(e.transform.z)));
}

/**
 * Unload chunk `(cx, cz)`: capture its persistent entities via
 * `serializeChunk`, then forget every entity in the chunk (persistent or not)
 * via `forgetChunk`. Returns the persistent records for the caller to hand to
 * a save sink (038); never throws.
 */
export function deactivateChunk(manager: EntityManager, cx: number, cz: number): SerializedEntity[] {
  const records = manager.serializeChunk(cx, cz);
  manager.forgetChunk(cx, cz);
  return records;
}

/**
 * Load chunk `(cx, cz)`'s entities from previously persisted `records`. A thin
 * wrapper around `EntityManager.deserializeChunk`, kept for naming symmetry
 * with {@link deactivateChunk}; same atomic validate-then-spawn contract.
 */
export function activateChunk(
  manager: EntityManager,
  cx: number,
  cz: number,
  records: unknown[],
): number {
  return manager.deserializeChunk(cx, cz, records);
}
