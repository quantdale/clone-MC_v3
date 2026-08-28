# Design: 129-entity-core

## Context/current state
- 017 `EntityRegistry` (`src/data/EntityType.ts`) provides typed, dense-runtime-id entity *type*
  definitions (`zombie`, `pig`, `item`, ...) — no live instances.
- 037 `SerializedEntity`/`EntityChunkRecord` (`src/storage/EntityRecord.ts`) define a persistence
  envelope for a future entity framework; no writer/reader beyond `ItemEntityManager` exists yet.
- `ItemEntityManager` (111) and `XpOrbManager` (117) are two independent, fully-featured but
  entity-kind-specific managers, each minting its own strictly-increasing numeric id and each with
  its own fields (`ItemEntity` has `item`/`count`; `XpOrb` has `value`). Neither shares a base type.
- There is no general `EntityInstance`/`EntityManager` runtime substrate.

## Target state
- `src/world/Entity.ts`: the pure `EntityInstance` data shape plus `EntityTransform`/
  `EntityVelocity` value types and their validators.
- `src/simulation/EntityManager.ts`: a manager mirroring the id-minting/insertion-order idiom of
  `ItemEntityManager`, scoped to spawn/query/mutate/remove — no physics, no persistence, no chunk
  gating, no dirty tracking.

## Invariants
- Every `EntityInstance.id` minted by one `EntityManager` is unique for the lifetime of that manager
  (until `clear()` resets minting); ids are non-negative integers assigned in strictly increasing
  order when not explicitly supplied.
- `spawn` either fully succeeds (returns a new `ACTIVE` `EntityInstance`, registers it under `id`,
  advances `nextId` past `id`) or fully fails (throws, manager state byte-for-byte unchanged) — never
  partial.
- `transform` always holds five finite numbers; `velocity` always holds three finite numbers. No
  stored instance may violate this — every mutator re-validates before writing.
- `state` only ever transitions `ACTIVE → REMOVED`, never the reverse; `remove` is the only mutator
  that performs this transition.
- `getAll()`/`getInDimension()`/`size` reflect only `ACTIVE` entities; `get(id)` returns a record
  regardless of state (so a caller can observe the final state of a just-removed entity), and returns
  `undefined` only for an id that was never spawned.
- `typeId` is immutable after spawn (no "change type" operation is offered); `dimension` is the one
  entity-identity field that can change post-spawn, via `changeDimension`.

## API and data model
`src/world/Entity.ts`:
```ts
export interface EntityTransform { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number; }
export interface EntityVelocity { readonly vx: number; readonly vy: number; readonly vz: number; }
export const ZERO_VELOCITY: EntityVelocity; // frozen { vx:0, vy:0, vz:0 }
export type EntityLifecycleState = 'ACTIVE' | 'REMOVED';
export interface EntityInstance {
  readonly id: number;
  readonly typeId: ResourceId;
  transform: EntityTransform;
  velocity: EntityVelocity;
  dimension: ResourceId;
  state: EntityLifecycleState;
}
export function isValidTransform(t: EntityTransform): boolean;
export function isValidVelocity(v: EntityVelocity): boolean;
```
`src/simulation/EntityManager.ts`:
```ts
export interface SpawnEntityOptions { velocity?: EntityVelocity; id?: number; }
export class EntityManager {
  constructor(registry: EntityRegistry);
  spawn(typeId: ResourceId, dimension: ResourceId, transform: EntityTransform, opts?: SpawnEntityOptions): EntityInstance;
  get(id: number): EntityInstance | undefined;
  getAll(): EntityInstance[];
  getInDimension(dimension: ResourceId): EntityInstance[];
  setTransform(id: number, transform: EntityTransform): boolean;
  setVelocity(id: number, velocity: EntityVelocity): boolean;
  changeDimension(id: number, dimension: ResourceId): boolean;
  remove(id: number): boolean;
  get size(): number;
  clear(): void;
}
```

## Control/data flow
1. A caller constructs `new EntityManager(entityRegistry)` once per world.
2. `spawn(typeId, dimension, transform, opts?)`:
   a. Validates `registry.has(typeId)`, `isValidTransform(transform)`, and
      `isValidVelocity(opts?.velocity ?? ZERO_VELOCITY)` — throws on the first failure, no mutation.
   b. Resolves `id = opts?.id ?? nextId++`; if `opts.id` collides with any existing record (`ACTIVE`
      or retained `REMOVED`), throws before any mutation.
   c. Constructs a defensive-copied `EntityInstance` (`state: 'ACTIVE'`), stores it, appends to the
      insertion-order list, and advances `nextId` past `id` when needed.
3. `getAll()`/`getInDimension()` filter the insertion-order list to `ACTIVE` records.
4. `setTransform`/`setVelocity`/`changeDimension` look up by id, require `ACTIVE`, re-validate
   (transform/velocity setters only), and write a defensive copy; any failure is a `false` return,
   never a throw.
5. `remove(id)` flips `state` to `REMOVED` and splices `id` out of the insertion-order list, but keeps
   the record in the id map so a later `get(id)` still resolves it.
6. `clear()` empties both the id map and the insertion-order list and resets `nextId` to 0.

## Detailed behavior
- Defensive copying: `spawn`/`setTransform`/`setVelocity` store `{ ...value }` rather than the
  caller's object reference, so later caller-side mutation of the passed transform/velocity object
  cannot silently corrupt manager state.
- `getInDimension` compares `resourceIdToString(entity.dimension) === resourceIdToString(dimension)`
  (value equality, not reference equality) since `ResourceId` objects are not guaranteed to be the
  same reference across calls.
- An id collision on `opts.id` is checked against the id map (which retains `REMOVED` records), so a
  caller cannot resurrect a removed id's slot by supplying it explicitly either.

## Failure modes
- `spawn` with an unregistered `typeId`: throws, no mutation.
- `spawn` with any non-finite `transform` field: throws, no mutation.
- `spawn` with any non-finite `velocity` field (explicit or defaulted — `ZERO_VELOCITY` is always
  valid, so this only triggers on a caller-supplied bad velocity): throws, no mutation.
- `spawn` with an `opts.id` already present in the id map (`ACTIVE` or `REMOVED`): throws, no
  mutation.
- `get`/`setTransform`/`setVelocity`/`changeDimension`/`remove` on an unknown id: `undefined`/`false`,
  never throws.
- `setTransform`/`setVelocity`/`changeDimension`/`remove` on a `REMOVED` id: `false`, never throws
  (mirrors "no reverse lifecycle transition" and "no mutation of a dead entity").
- `setTransform`/`setVelocity` with a non-finite field on an otherwise-valid `ACTIVE` id: `false`, no
  partial write.

## Compatibility/migration
- Two new files; zero edits to existing modules. No registry/schema/save-format change. No
  migration.

## Performance/resource constraints
- Every operation is O(1) amortized except `getAll()`/`getInDimension()` (O(n) over live entities,
  matching `ItemEntityManager.getItemEntities()`'s existing cost model) and `remove()`'s
  `Array.indexOf`/`splice` (O(n), matching `ItemEntityManager.removeItemEntity`). No unbounded
  growth: `clear()` fully resets state; there is no per-tick cost since 129 adds no tick/update loop.

## Testing seams
- `EntityManager` depends only on an `EntityRegistry` instance (constructed via
  `createDefaultEntityRegistry()` or a minimal hand-built registry in tests) — no `Game`/`World`.
- All mutators are pure with respect to their inputs and return either the new state or a boolean
  success flag, so tests assert on return values and on `get(id)` snapshots without needing a fake
  clock or RNG.

## Observability/debugging
- `get(id)` exposes the full instance (including `state`) for inspection.
- `size` and `getAll().length` agree at all times (both count only `ACTIVE`).

## Affected files/symbols
- `src/world/Entity.ts` (new).
- `src/simulation/EntityManager.ts` (new).
- Tests: `tests/unit/EntityManager.test.ts` (new).

## Rejected alternatives
- **Unifying `ItemEntityManager`/`XpOrbManager` onto `EntityInstance` now**: rejected — both are
  fully tested with kind-specific fields and consumers wired into `Game`; forcing a shared base in
  this change would be a wide, risky refactor far beyond "entity core" scope. They remain independent
  until an explicit future migration change, if ever undertaken.
- **Silent overwrite on an `opts.id` collision (mirroring 111)**: rejected — 111's silent-overwrite
  convenience exists for its own deserialize-rehydration path; 129 has no such consumer yet, so
  throwing on collision surfaces a caller bug immediately instead of masking it.
- **Cross-validating `dimension` against a `DimensionTypeRegistry`**: rejected — no multi-dimension
  `World` exists yet to validate membership against; `dimension` stays an opaque, type-safe
  `ResourceId` tag until a later change needs the cross-check.
- **Integrating velocity into position on a tick**: rejected — that is exactly 130's scope
  (`entity-collision-and-physics`); 129 only stores velocity.

## Downstream dependencies
- 130 (`entity-collision-and-physics`) integrates `velocity` into `transform` through shape-aware
  collision, using `EntityManager.setTransform`/`getAll`.
- 131 (`entity-persistence-runtime`) will serialize `EntityInstance` via the existing 037
  `SerializedEntity` envelope.
- 132 (`entity-chunk-tracking`) will gate which entities tick based on chunk tickets/simulation
  distance, using `getInDimension`/`getAll` as its enumeration seam.
- 133 (`entity-data-tracker`) will add a dirty-property container layered on top of `EntityInstance`.
