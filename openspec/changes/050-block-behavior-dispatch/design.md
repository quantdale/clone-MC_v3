# Design: 050-block-behavior-dispatch

## Context / current state

Block logic is central-switch based. 047-049 built the scheduling/neighbor primitives; 050 provides
the per-block-type dispatch layer so behaviors are registry-selected modules.

## Target state

A `BlockBehaviorRegistry` maps block keys to `BlockBehavior` modules. Consumers (future world wiring)
look up `getBehavior(blockKey)` and call the relevant optional hook with a `BlockBehaviorContext`
(position, tick, minimal block-world access). Unregistered blocks get the shared no-op default.

## Invariants

- `register` accepts only non-empty string keys and object behaviors; a duplicate key throws.
- `getBehavior` returns the registered module, or the shared `DEFAULT_BLOCK_BEHAVIOR` singleton for
  unregistered keys (never a new object per call).
- All hooks are optional; the default module implements none.
- `hasBehavior`/`size` reflect registration; `clear` empties the registry.
- The registry is decoupled from the world: behaviors interact through `BlockWorldAccess` only.

## API and data model

```ts
// src/simulation/BlockBehavior.ts
export interface BlockWorldAccess {
  getBlockId(x: number, y: number, z: number): number;
  setBlockId(x: number, y: number, z: number, id: number): void;
}
export interface BlockBehaviorContext {
  x: number; y: number; z: number;
  tick: number;
  world: BlockWorldAccess;
}
export interface BlockBehavior {
  onScheduledTick?(ctx: BlockBehaviorContext): void;
  onRandomTick?(ctx: BlockBehaviorContext): void;
  onNeighborChanged?(ctx: BlockBehaviorContext, fromX: number, fromY: number, fromZ: number): void;
  onPlaced?(ctx: BlockBehaviorContext): void;
  onBroken?(ctx: BlockBehaviorContext): void;
}
export const DEFAULT_BLOCK_BEHAVIOR: BlockBehavior; // frozen {}
export class BlockBehaviorRegistry {
  register(blockKey: string, behavior: BlockBehavior): void;
  getBehavior(blockKey: string): BlockBehavior;
  hasBehavior(blockKey: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Content registers behaviors: `registry.register('minecraft:grass', grassBehavior)`.
2. A scheduled/random/neighbor/place/break event for a block looks up
   `const behavior = registry.getBehavior(blockKey)` and calls the hook (if present) with a context
   built from the event's position/tick/world.
3. Unregistered blocks resolve to the default no-op — zero dispatch cost beyond a Map lookup.

## Detailed behavior

- `register` validates key non-empty string and behavior non-null object; throws `Error` on
  duplicates; frozen behaviors are allowed (the registry only stores references).
- `DEFAULT_BLOCK_BEHAVIOR` is a frozen empty object shared by all lookups.

## Failure modes

- Duplicate registration → `Error` with the offending key.
- Invalid key/behavior → `Error`.

## Compatibility / migration

Additive; no consumers yet. Behavior keys use the block resource-key namespace (002-style strings).

## Performance / resource constraints

`getBehavior` is an O(1) Map lookup; the default path shares one object (no allocation).

## Testing seams

- `tests/unit/BlockBehavior.test.ts`:
  - default behavior for unregistered keys (identity: `getBehavior('x') === DEFAULT_BLOCK_BEHAVIOR`);
  - register/get/has round-trip; per-key isolation;
  - duplicate registration throws; empty key throws; non-object behavior throws;
  - clear empties;
  - hook invocation: a behavior whose `onRandomTick` writes through `ctx.world` is invoked with the
    expected position/tick/world (mock world records calls).

## Observability / debugging

`size`/`hasBehavior` expose registration state.

## Affected files / symbols

- `src/simulation/BlockBehavior.ts` — NEW.
- `tests/unit/BlockBehavior.test.ts` — NEW.

## Rejected alternatives

- *Interfaces per block type*: one interface with optional hooks is the minimal composable form; a
  behavior can implement only the hooks it needs.
- *Extending `BlockTypeDefinition` with behavior fields*: couples the registry (003-style) to
  behavior code; a separate behavior registry keeps concerns separate.

## Downstream dependencies

125/128 (crops/fire) implement behavior modules and register them; the world wiring (later change)
dispatches queue/tick events through this registry; 050's context shape is reused by 052 (block
entities).
