# Design: 309-resource-leak-and-storage-boundedness-remediation

## Context/current state

1. `src/storage/DirtySaveQueue.ts`:
   `DirtySaveQueue` uses `this.epochs = new Map<string, number>()` to ensure monotonic versioning per key so an older in-flight write does not overwrite a newer mark. However, `this.epochs` is never pruned when a write completes. In a 10,000 distinct-key probe, `this.epochs.size` remained at 10,000 after all writes completed and `this.pending.size` was 0.

2. `src/engine/Game.ts`:
   In `syncWitherPresentation()`:
   - For every fixed tick with wither skulls, `this.skullMeshes` destroys every mesh and creates a new `SphereGeometry(0.15, 6, 6)` and `THREE.MeshLambertMaterial({ color: ... })`.
   - On line 4534, it calls `mesh.geometry.dispose()`, but never calls `(mesh.material as THREE.Material).dispose()`.
   - This causes thousands of WebGL shader programs to leak into GPU memory over time, alongside unnecessary per-tick garbage collection pressure.
   - When withers die (`!present.has(id)`), the group is removed from `this.witherGroup`, but child geometries and materials are not disposed.
   In `dispose()`:
   - `this.world.dispose()`, `this.materials.dispose()`, `this.atlas.dispose()`, `this.resources.dispose()`, `this.hotbar.dispose()`, `this.modalFocus.dispose()` are called.
   - However, `this.renderer`, `this.audio`, `this.interaction`, `this.environment`, `this.lighting`, `this.passiveMobRenderer`, `this.hostileMobRenderer`, `this.raiderRenderer`, `this.splashPotionRenderer`, and `this.worldLife` all implement `dispose()`, but NONE of them are invoked by `Game.dispose()`.

## Target state

1. `DirtySaveQueue`:
   - Under the single-flight drain mutex, when a write succeeds and `this.epochs.get(key) === entry.epoch`, the entry is pruned from `this.epochs` (`this.epochs.delete(key)`).
   - If `clear()` is invoked when no write is in flight, `this.epochs.clear()` resets the map. If a write is in flight, epochs for un-cleared in-flight keys remain until the write finishes, while all other epochs are cleared.
   - `retainedEpochCount` getter exposes `this.epochs.size` for observability and tests.
   - Memory is strictly bounded to the active pending + in-flight set.

2. `Wither Presentation`:
   - A single shared static `SphereGeometry(0.15, 6, 6)` is reused for all skulls.
   - Two shared materials (`blue` and `dark`) are allocated once and reused across all skulls.
   - Skull meshes update positions and visibility rather than reallocating geometries and materials every tick.
   - When a wither group is removed on death, its child meshes, geometries, and materials are properly traversed and disposed.
   - On `Game.dispose()`, skull meshes and wither groups are fully traversed and disposed.

3. `Game.dispose()`:
   - Calls `dispose()` on `this.renderer`, `this.audio`, `this.interaction`, `this.environment`, `this.lighting`, `this.passiveMobRenderer`, `this.hostileMobRenderer`, `this.raiderRenderer`, `this.splashPotionRenderer`, `this.worldLife`, and `this.ambientBackend` (if disposable).
   - Cleans up wither meshes and skull meshes.
   - Teardown remains completely idempotent.

## Invariants

- FIFO drain order, supersession prevention, and failure requeue contracts of `DirtySaveQueue` remain byte-for-byte identical.
- Game loop stop, fixed tick pause, modal focus release, and existing save contracts of `Game.dispose()` remain intact.
- Wither boss rendering and skull appearance remain visually identical.

## API and data model

- `DirtySaveQueue` gains read-only property `get retainedEpochCount(): number`.
- No changes to public game interfaces, save schemas, or network protocols.

## Control/data flow

- **DirtySaveQueue write completion**:
  `drainReportUnlocked` executes write.
  If `this.epochs.get(key) === entry.epoch`:
  - `written++`
  - `committedKeys.push(key)`
  - `this.epochs.delete(key)` (prune epoch since no newer mark arrived)
- **DirtySaveQueue clear**:
  - `this.clearGeneration++`
  - `this.pending.clear()`
  - If `this.inFlightKey === null`: `this.epochs.clear()`
  - Else: keep only `this.inFlightKey` in `this.epochs`.
- **Game dispose**:
  - Perform durable saves and close panels as existing.
  - Teardown sub-renderers, interaction outline, environment, lighting, audio context, and Three.js renderer.

## Detailed behavior

- **Epoch pruning during concurrent mark**:
  If a mark occurs while write is in flight: `this.epochs.get(key)` becomes `entry.epoch + 1`.
  `this.epochs.get(key) !== entry.epoch` evaluates to `true`.
  The epoch is NOT deleted, ensuring the subsequent drain correctly identifies the newer entry.
- **Wither skull reuse**:
  Existing skull mesh is repositioned and material assigned based on `kind === 'blue'`. Extra meshes beyond current skull count are hidden or removed, disposing nothing unnecessarily.

## Failure modes

- In-flight write failure: catch block requeues entry if `clearGeneration` matches, and epoch is retained so retry retains its generation.
- Double `Game.dispose()`: all disposed flags prevent re-entrant or repeated disposal errors.

## Compatibility/migration

100% backward compatible. No schema, storage, or protocol migrations required.

## Performance/resource constraints

- 10,000 distinct queued writes: 0 retained epoch entries upon completion.
- Wither battle with 12 skulls: 0 material allocations per tick (previously 720/sec).
- `Game.dispose()`: WebGL context listeners detached, AudioContext closed, Three.js geometries/materials freed.

## Testing seams

- `DirtySaveQueue.retainedEpochCount` getter.
- Unit tests in `tests/unit/DirtySaveQueue.test.ts`.
- Unit tests in `tests/unit/GameLifecycleTeardown.test.ts` asserting complete disposal across all subsystems.

## Observability/debugging

`retainedEpochCount` on the queue allows monitoring in diagnostics and test suites.

## Affected files/symbols

- `src/storage/DirtySaveQueue.ts`
- `src/engine/Game.ts`
- `tests/unit/DirtySaveQueue.test.ts`
- `tests/unit/GameLifecycleTeardown.test.ts` (new test suite)

## Rejected alternatives

- *WeakRef for epochs*: Key strings cannot be WeakRef targets; string primitives require explicit cleanup.
- *Rebuilding skull meshes every tick with material.dispose()*: Still causes GPU reallocation thrashing and garbage collection spikes. Reusing static geometry and materials is strictly superior.

## Downstream dependencies

None.
