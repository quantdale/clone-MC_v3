# Design: 032-render-vs-simulation-distance

## Context / current state

`World` owns a single `private readonly renderDistance: number` (default
`CONFIG.renderDistance`). It is used by:

- `ensureChunks(px, pz)` — double loop `dx,dz in [-rd, rd]` queues generation.
- `unloadChunks(px, pz)` — unloads chunks beyond `renderDistance + 1`.
- `getReadyProgress(px, pz)` — readiness ring `Math.min(2, renderDistance)`.

There is no simulation radius, and no API to ask "is chunk (cx,cz) within the
render/simulation radius of the player?" The streaming center is
`streamCenterX/streamCenterZ` (initially `null`).

## Target state

Two radii:

- **rendering radius** — drives chunk loading, generation, meshing, unloading, and
  the readiness ring (unchanged behavior).
- **simulation/ticking radius** — drives `isChunkSimulating`; smaller-or-equal by
  convention, independently configurable.

## Invariants

- Both radii MUST be non-negative integers/numbers (`>= 0`).
- Distance is Chebyshev (max of |Δx|, |Δz|), matching the existing `±rd` loops.
- A chunk within the simulation radius is not guaranteed to be within the render
  radius; in practice simulation radius MUST be `<=` render radius (documented, not
  enforced by the pure model).
- `isChunkSimulating` is false before the first `update` sets the stream center
  (center `null`).

## API and data model

```ts
// src/world/RenderSimulationDistance.ts
export class RenderSimulationDistance {
  constructor(public readonly renderDistance: number,
              public readonly simulationDistance: number) {
    if (renderDistance < 0 || simulationDistance < 0) throw new Error(...);
  }
  static chebyshev(cx, cz, pcx, pcz): number;
  isWithinRenderDistance(cx, cz, pcx, pcz): boolean;       // cheb <= renderDistance
  isWithinSimulationDistance(cx, cz, pcx, pcz): boolean;   // cheb <= simulationDistance
  static fromConfig(partial?: { renderDistance?: number; simulationDistance?: number }): RenderSimulationDistance;
}
```

`World` additions:

```ts
private readonly simulationDistance: number;            // opts.simulationDistance ?? CONFIG.simulationDistance
getRenderDistance(): number;
getSimulationDistance(): number;
isChunkSimulating(cx: number, cz: number): boolean;    // delegates to rsd w/ stream center
```

`World` keeps an internal `RenderSimulationDistance` instance for classification and
continues to use `renderDistance` for `ensureChunks`, `unloadChunks`, and
`getReadyProgress`.

## Control / data flow

1. `Game.runtimeSimulationDistance()` returns `CONFIG.simulationDistance` (headless
   override `CONFIG.headless.simulationDistance`).
2. `Game` constructs `World({ ..., renderDistance, simulationDistance })` and
   `Environment(scene, renderDistance, seed)`.
3. Each `World.update` sets `streamCenterX/Z`. `isChunkSimulating(cx,cz)` compares
   `(cx,cz)` against that center using the simulation radius.
4. Future tick loops call `world.isChunkSimulating` to decide whether a chunk's
   blocks/entities are simulated — the spatial gate this change introduces.

## Detailed behavior

- `RenderSimulationDistance` constructor rejects negative radii.
- `isWithinRenderDistance(cx, cz, pcx, pcz)`:
  `Math.max(Math.abs(cx-pcx), Math.abs(cz-pcz)) <= renderDistance`.
- `isWithinSimulationDistance(...)`: same with `simulationDistance`.
- `World.isChunkSimulating(cx, cz)`: if `streamCenterX/Z === null` → `false`; else
  `rsd.isWithinSimulationDistance(cx, cz, centerX, centerZ)`.

## Failure modes

- Negative radius passed to `RenderSimulationDistance` → throws synchronously at
  construction; no partial instance escapes.
- `World` constructed without `simulationDistance` → falls back to
  `CONFIG.simulationDistance` (default == render distance) — behavior unchanged.
- `isChunkSimulating` before streaming → `false` (no center yet).

## Compatibility / migration

New config fields with defaults equal to the render distance. No stored or public
data formats change.

## Performance / resource constraints

Classification is O(1) arithmetic. No allocations on the hot streaming path. `World`
holds one small `RenderSimulationDistance` instance.

## Testing seams

- Pure module: `tests/unit/RenderSimulationDistance.test.ts` covers chebyshev,
  boundary inclusion/exclusion for each radius, independent radii (render 4 / sim 2),
  negative-radius rejection, and `fromConfig` defaults.
- Integration: the same test file constructs a `World` (stub generator/mesher) with
  `renderDistance: 4, simulationDistance: 2`, streams to a center, and asserts
  `getRenderDistance`/`getSimulationDistance` and `isChunkSimulating` classify a
  chunk at distance 3 (rendered, not simulating) vs distance 2 (both).

## Observability / debugging

`World.getStats()` is unchanged; the two radii are queryable via the new accessors.

## Affected files / symbols

- `src/config/index.ts` — add `simulationDistance` (+ headless).
- `src/world/RenderSimulationDistance.ts` — NEW.
- `src/world/World.ts` — store `simulationDistance`; add accessors + `isChunkSimulating`;
  keep streaming on `renderDistance`.
- `src/engine/Game.ts` — `runtimeSimulationDistance()`; pass `simulationDistance` to `World`.
- `tests/unit/RenderSimulationDistance.test.ts` — NEW.

## Rejected alternatives

- *Single radius with a "tick flag" per chunk*: mixes spatial and per-chunk concerns
  and gives no clean spatial gate for future tick loops; 031 already models per-chunk
  tickets, so the missing piece is the spatial radius, not another flag.
- *Make `World` own the classifier inline without a dedicated module*: a separate
  `RenderSimulationDistance` mirrors the repo's one-concept-per-file pattern
  (ChunkStatus, ChunkTicket) and is independently testable without a renderer.

## Downstream dependencies

Future block/entity ticking and mob-spawn changes will call
`world.isChunkSimulating` as their spatial gate.
