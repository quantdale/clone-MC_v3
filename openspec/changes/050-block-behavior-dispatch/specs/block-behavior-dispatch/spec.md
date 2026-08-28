# Spec: block-behavior-dispatch

## Contract

Block logic MUST be dispatched through registry-selected behavior modules rather than central block
switches. A `BlockBehavior` interface MUST define optional lifecycle hooks; a `BlockBehaviorContext`
MUST carry position, tick, and a minimal block-world access; a `BlockBehaviorRegistry` MUST map block
keys to modules with a shared no-op default, rejecting duplicate/invalid registration.

## Definitions

- **BlockBehavior**: an object with optional `onScheduledTick` / `onRandomTick` / `onNeighborChanged` /
  `onPlaced` / `onBroken` hooks.
- **BlockBehaviorContext**: `{ x, y, z, tick, world }` where `world` is a minimal
  `BlockWorldAccess` (`getBlockId`/`setBlockId`).
- **Default behavior**: the frozen empty module returned for unregistered keys.

## Invariants

- `getBehavior` returns the registered module or the shared default (same object per call).
- `register` accepts only non-empty keys and object behaviors; duplicate keys throw.
- All hooks are optional; the default implements none.
- `hasBehavior`/`size` reflect registration; `clear` empties it.

## Requirements

### Requirement: default dispatch
`getBehavior` MUST return the shared default for unregistered keys.

#### Scenario: unregistered key
- **GIVEN** a fresh registry
- **WHEN** `getBehavior('minecraft:air')` runs twice
- **THEN** both calls return `DEFAULT_BLOCK_BEHAVIOR` (same object).

### Requirement: register/get/has
`register` MUST store a behavior per key; `getBehavior`/`hasBehavior` MUST reflect it per key.

#### Scenario: per-key isolation
- **GIVEN** `register('a', behaviorA)` and `register('b', behaviorB)`
- **WHEN** `getBehavior('a')`, `getBehavior('b')`, `getBehavior('c')`, and `hasBehavior` queries run
- **THEN** `a`/`b` return their modules, `c` returns the default, and `hasBehavior('a')` is true while
  `hasBehavior('c')` is false.

### Requirement: registration validation
`register` MUST throw on empty keys, non-object behaviors, and duplicate keys.

#### Scenario: invalid registrations
- **GIVEN** a registry with `register('x', {})`
- **WHEN** `register('', {})`, `register('y', null)`, and `register('x', {})` run
- **THEN** each throws a descriptive `Error`.

### Requirement: hook invocation with context
A registered behavior's hooks MUST be invocable with a context carrying position, tick, and the world
access; hooks not implemented MUST be safely absent.

#### Scenario: random-tick hook
- **GIVEN** a behavior whose `onRandomTick` calls `ctx.world.setBlockId(ctx.x, ctx.y, ctx.z, 99)` and
  a mock world
- **WHEN** the hook is invoked with a context for `(1, 2, 3)` at tick `40`
- **THEN** the mock world recorded a set at `(1, 2, 3)` with id `99` and the context's tick was `40`.

### Requirement: clear
`clear` MUST remove all registrations.

#### Scenario: clearing
- **GIVEN** two registered behaviors
- **WHEN** `clear()` runs
- **THEN** `size` is `0` and `getBehavior` returns the default for both keys.

## Error and failure behavior

- Duplicate/invalid registration throws `Error` with a descriptive message.

## Performance and resource bounds

`getBehavior` is an O(1) Map lookup; the default path allocates nothing (shared object).

## Compatibility and migration

Additive; no consumers yet; behavior keys use the block resource-key namespace.

## Security and integrity

Registry-selected dispatch removes central-switch coupling; validation prevents mis-registration.

## Observability

`size`/`hasBehavior` expose registration state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Default dispatch | same default object for unregistered keys |
| Register/get/has | per-key isolation and queries |
| Registration validation | empty key / non-object / duplicate throw |
| Hook invocation with context | mock world records position/tick |
| Clear | empties all registrations |
