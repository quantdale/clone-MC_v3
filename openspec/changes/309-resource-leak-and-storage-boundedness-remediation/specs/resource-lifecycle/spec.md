# Spec: resource-lifecycle

## Contract

Save queue epoch bookkeeping MUST be strictly bounded by active pending and in-flight units. Game presentation loops MUST NOT leak GPU materials or allocate per-tick shader resources. Game lifecycle teardown MUST cleanly and idempotently release all allocated Three.js, audio, and presentation resources.

## Definitions

- **Retained epoch**: A key in `DirtySaveQueue.epochs` that maps a unit key to its monotonic version number.
- **Un-superseded write**: A completed write whose key in `this.epochs` matches the epoch assigned when the write was popped from `this.pending`.
- **Subsystem teardown**: Invoking `.dispose()` on a component that holds WebGL buffers, shaders, event listeners, or audio contexts.

## Invariants

- FIFO drain order, supersession prevention, and failure requeue contracts of `DirtySaveQueue` are preserved.
- Existing save/recovery, world ownership, and pause semantics are preserved.
- Change 258 remains BLOCKED; no hardware GPU evidence is claimed.

## Requirements

### Requirement: R1 save queue epoch map boundedness

When a queued write completes successfully without being superseded during write execution, its entry in `this.epochs` MUST be removed. When `clear()` is invoked, all epochs not associated with an active in-flight write MUST be removed. A public getter `retainedEpochCount` MUST expose the count of currently retained epoch entries.

#### Scenario: 10,000 distinct keys drained
- **GIVEN** a `DirtySaveQueue` with 10,000 distinct keys marked dirty
- **WHEN** all units are successfully drained
- **THEN** `queue.size` is 0
- **AND** `queue.retainedEpochCount` is 0.

#### Scenario: concurrent mark retains epoch
- **GIVEN** a key marked dirty whose write is held in flight
- **WHEN** a newer mark lands for the same key while the write is in flight
- **AND** the older write completes
- **THEN** the key's epoch is NOT pruned
- **AND** the subsequent drain writes the newer payload.

#### Scenario: clear during write clears unrelated epochs
- **GIVEN** an in-flight write for key A and pending units for keys B and C
- **WHEN** `queue.clear()` is called
- **THEN** keys B and C epochs are removed
- **AND** after key A finishes, `queue.retainedEpochCount` is 0.

---

### Requirement: R2 wither presentation resource reuse and cleanup

Wither skull rendering MUST NOT allocate new `THREE.SphereGeometry` or `THREE.MeshLambertMaterial` instances on each frame/tick. It MUST reuse static shared skull geometry and materials. When a wither despawns or is removed from the active set, its child meshes, geometries, and materials MUST be disposed.

#### Scenario: skull mesh updates across multiple ticks
- **GIVEN** active wither skulls in the world
- **WHEN** fixed ticks advance and skulls move
- **THEN** skull meshes update positions without allocating new `MeshLambertMaterial` or `SphereGeometry` instances
- **AND** no Three.js material is leaked.

#### Scenario: wither despawn cleanup
- **GIVEN** an active wither with a rendered mesh group
- **WHEN** the wither is defeated or despawned
- **THEN** all child geometries and materials belonging to the wither group are disposed.

---

### Requirement: R3 comprehensive Game teardown

When `Game.dispose()` is called, it MUST invoke `.dispose()` on all internal sub-renderers and resource holders:
- `renderer.dispose()`
- `audio.dispose()`
- `interaction.dispose()`
- `environment.dispose()`
- `lighting.dispose()`
- `passiveMobRenderer.dispose()`
- `hostileMobRenderer.dispose()`
- `raiderRenderer.dispose()`
- `splashPotionRenderer.dispose()`
- `worldLife.dispose()`
- and any remaining wither/skull meshes.
Calling `dispose()` repeatedly MUST be safe and idempotent.

#### Scenario: game dispose releases all subsystems
- **GIVEN** an active `Game` instance
- **WHEN** `game.dispose()` is called
- **THEN** `.dispose()` is invoked on `renderer`, `audio`, `interaction`, `environment`, `lighting`, `passiveMobRenderer`, `hostileMobRenderer`, `raiderRenderer`, `splashPotionRenderer`, and `worldLife`
- **AND** calling `game.dispose()` a second time does not throw.

## Error and failure behavior

If any subsystem encounters an error during disposal, subsequent disposals must still be attempted where possible to prevent partial resource leakage.

## Performance and resource bounds

- Zero retained epoch map keys after queue drain completion.
- Zero WebGL material allocations per tick during wither skull rendering.
- Complete release of WebGL and Web Audio resources on game teardown.

## Compatibility and migration

No storage format, schema, or public API breaking changes.

## Security and integrity

Prevents memory exhaustion and GPU shader leak denial-of-service in long-running browser sessions.

## Observability

`DirtySaveQueue.retainedEpochCount` provides verifiable observability.

## Verification mapping

- Unit tests in `tests/unit/DirtySaveQueue.test.ts`.
- Unit tests in `tests/unit/GameLifecycleTeardown.test.ts`.
- Full baseline verification gate.
