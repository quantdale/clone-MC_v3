# Proposal: 050-block-behavior-dispatch

## Problem

Block logic (tick handling, neighbor reactions, place/break effects) is currently expressed as central
switches over block types scattered through gameplay code. That makes adding behavior to a block touch
many call sites and prevents behavior from being data-driven. 047-049 provide tick/random/neighbor
queues, but nothing dispatches behavior *by block type* through a registry.

## Goals

- Define a `BlockBehavior` module interface (optional lifecycle hooks) and a `BlockBehaviorContext`
  (position + tick + a minimal block-world access).
- Provide a `BlockBehaviorRegistry` that maps block keys → behavior modules, with a shared no-op
  default so unregistered blocks behave inertly.
- Dispatch is registry-selected: consumers look up `getBehavior(blockKey)` and invoke hooks — no
  central block switches.

## Non-goals

- Implementing any concrete block behavior (crops, fire, redstone — later changes 125/128/154+).
- Wiring the queues (047-049) into the world (a later consumer change).
- Data-driven behavior definitions from files (020-style loading is a later concern).

## Preconditions

- Change 049 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 049 baseline (633 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/BlockBehavior.ts` (NEW): `BlockWorldAccess` (minimal `getBlockId`/`setBlockId`),
  `BlockBehaviorContext`, `BlockBehavior` (optional `onScheduledTick`/`onRandomTick`/
  `onNeighborChanged`/`onPlaced`/`onBroken`), `DEFAULT_BLOCK_BEHAVIOR`, and `BlockBehaviorRegistry`
  (`register`/`getBehavior`/`hasBehavior`/`size`/`clear`).
- `tests/unit/BlockBehavior.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- Duplicate registration for a block key: rejected with a descriptive error (a later change may allow
  override with explicit policy).
- Behaviors must not assume a specific world class; the minimal `BlockWorldAccess` keeps them
  decoupled and testable.

## Rollback strategy

Revert the commit; the registry is additive.

## Definition of Done

- `getBehavior` returns the registered module or the shared no-op default; `hasBehavior` reflects
  registration.
- `register` rejects empty keys and duplicates; `clear` empties the registry.
- Hooks are optional (a module may implement only what it needs); context carries position, tick, and
  the block-world access.
- Unit tests cover default dispatch, register/get/has, duplicate rejection, clear, and hook invocation
  with a mock world.
- Full gate green; 050 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 050 suite; E2E stays 19/19.
