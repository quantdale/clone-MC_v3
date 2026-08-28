# Proposal: 129-entity-core

## Problem
The world catalog has typed entity *data* (017 `EntityRegistry`) and a persistence *envelope*
(037 `SerializedEntity`), but no general runtime entity model. Only two ad hoc, entity-shaped
managers exist (`ItemEntityManager` for dropped items, `XpOrbManager` for orbs), each with its own
id minting and fields. There is no shared, minimal, stable-identity runtime substrate — transform,
velocity, registered type, lifecycle, dimension ownership — that a future generic mob/projectile
framework (130+) can build on without re-deriving id minting and validation from scratch.

## Goals
- A pure data shape, `EntityInstance`, holding: a stable runtime id, a registered 017 entity type, a
  transform (position + yaw/pitch), a velocity, a lifecycle state (`ACTIVE`/`REMOVED`), and the
  dimension (`ResourceId`) it currently belongs to.
- An `EntityManager` that mints strictly increasing unique ids, validates every spawn against the
  017 `EntityRegistry` and finite transform/velocity fields, tracks lifecycle transitions
  (spawn → `ACTIVE` → `remove` → `REMOVED`), and offers pure setters for transform/velocity/dimension.
- Deterministic, unit-testable in isolation (no wall-clock, no global RNG, no `Game`/`World`
  dependency beyond the 017 registry).

## Non-goals
- **No collision/physics/gravity integration.** Velocity is stored only; integrating it into
  position is 130 (`130-entity-collision-and-physics`).
- **No persistence wiring.** Serializing `EntityInstance` through the 037 `SerializedEntity`
  envelope / 037 `EntityRepository` is 131 (`131-entity-persistence-runtime`).
- **No chunk-based activation/deactivation.** Ticking only entities near loaded/simulating chunks is
  132 (`132-entity-chunk-tracking`).
- **No dirty-property synchronization container.** A tracker for rendering/networking is 133
  (`133-entity-data-tracker`).
- **No migration of `ItemEntityManager` or `XpOrbManager` onto this model.** Both keep their current,
  independently tested shape; migrating them is out of scope and would be a later, explicitly scoped
  change if ever undertaken.
- **No cross-validation against a `DimensionTypeRegistry`.** `dimension` is an opaque, well-formed
  `ResourceId` ownership tag (structurally guaranteed valid by the `ResourceId` type); there is no
  multi-dimension `World` yet, so nothing to validate membership against.
- **No AI, spawning rules, or mob-specific behavior.** Those begin at 136+.

## Preconditions
- Change 128 (fire block simulation) is VERIFIED.
- Change 017 (`EntityRegistry`, `createDefaultEntityRegistry`) is VERIFIED and unchanged.
- Change 037 (`SerializedEntity`/`EntityRepository`) is VERIFIED; 129 does not modify it.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/EntityType.ts` (`EntityRegistry`, `EntityTypeDefinition`) — spawn validates the type is
  registered.
- `src/data/ResourceId.ts` (`ResourceId`, `resourceIdToString`) — entity type and dimension identity.
- Existing manager idioms (`src/simulation/ItemEntityManager.ts`) as the id-minting/insertion-order
  style to mirror for consistency.

## Proposed change
1. `src/world/Entity.ts` (NEW): `EntityTransform` (`x,y,z,yaw,pitch`), `EntityVelocity`
   (`vx,vy,vz`), `ZERO_VELOCITY`, `EntityLifecycleState`, `EntityInstance`, and the pure validators
   `isValidTransform`/`isValidVelocity` (every field a finite number).
2. `src/simulation/EntityManager.ts` (NEW): `EntityManager` bound to one `EntityRegistry` —
   `spawn(typeId, dimension, transform, opts?)`, `get(id)`, `getAll()`, `getInDimension(dimension)`,
   `setTransform(id, transform)`, `setVelocity(id, velocity)`, `changeDimension(id, dimension)`,
   `remove(id)`, `size`, `clear()`.
3. No other module is touched. `Game`, `ItemEntityManager`, and `XpOrbManager` are unchanged — this
   is an additive, unconsumed core.

## Compatibility and migration
- Purely additive: two new modules, zero edits to existing files, no schema/save-format change, no
  registry change. Nothing depends on `EntityManager` yet, so there is no migration and no regression
  surface beyond the new files' own tests.

## Risks
- **Scope creep into 130/131/132/133.** Mitigation: this proposal's non-goals list is explicit and
  the design/tasks do not implement movement integration, persistence, chunk gating, or a dirty
  tracker — only the data shape and the manager's spawn/query/mutate/remove surface.
- **Divergent id-minting convention vs. 111/117's managers.** Mitigation: documented as a deliberate,
  independent scheme (Rejected Alternatives in design.md); no shared code is forced between them
  since they are not being unified in this change.
- **Silent id collision on an explicit `opts.id`.** Mitigation: `spawn` throws on a colliding id
  (whether the existing record is `ACTIVE` or retained `REMOVED`), unlike 111's silent-overwrite
  convenience, since no deserialization consumer yet relies on overwrite-by-id.

## Rollback strategy
Two new files with zero consumers; deleting them fully reverts the change with no other impact.

## Definition of Done
- `EntityInstance`/`EntityTransform`/`EntityVelocity`/`isValidTransform`/`isValidVelocity` implemented
  and unit-tested.
- `EntityManager` implements spawn/get/getAll/getInDimension/setTransform/setVelocity/
  changeDimension/remove/size/clear with the validation and lifecycle rules in design.md/spec.md.
- Unit tests cover valid spawn, every invalid-input rejection, lifecycle transitions, dimension
  filtering, mutation on removed/unknown ids, and id-collision rejection.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, since nothing consumes the
  new modules yet).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
