# Design: 254-whole-codebase-performance-optimization

## Context/current state

Live engine hot paths (inspected 2026-08-26 at `d258414`):

- `src/world/WorldCoordinates.ts` — `worldToChunk`/`worldToLocal` return fresh `[number,number,number]`
  tuples; `chunkKey` interpolates a string.
- `src/world/World.ts:332` — `getBlock` calls `worldToChunk` + `worldToLocal` (2 tuples) then
  `chunkManager.getChunk` (1 string key) per invocation. `setBlockState`, `isSolid`,
  `isLoadedAt` share the pattern. `getBlock` is on every physics/raycast/light/mesh/AI query path.
- `src/world/ChunkManager.ts` — `Map<string, Chunk>` keyed by `chunkKey`.
- `src/rendering/LightStorage.ts` — `WorldLightStorage.sectionFor` builds `${sx},${sy},${sz}` per access
  to compare against a one-entry string cache; `SectionLightStorage.indexFor` allocates a
  `LocalCoord` object and runs `assertCoord` before every nibble read/write.
- `src/simulation/RandomTickSelector.ts` — `hash32(...values)` allocates a rest array per call;
  `selectEligible` allocates a `LocalCoord` via `localFromIndex(index)` per attempt and a tuple per hit.
- `src/engine/Game.ts:1179` — `tickRandomBlocks` probes eligibility with
  `blockRegistry.get(id).key` → `behaviorRegistry.getBehavior(key)` per attempt (two map lookups +
  string interning) up to 768 times per section × ~676 sections × 20 Hz.
- `src/player/PlayerPhysics.ts:113` — `shapeWorld.getCollisionShape` calls `world.isSolid(x,y,z)`
  and, when solid, `world.getBlock(x,y,z)` — two full voxel lookups per collision cell.
- `src/ui/HUD.ts` — `setFPS`/`setSurvival`/`setWorldTime` write `textContent` unconditionally,
  every frame/tick, even when the rendered text is unchanged.

## Target state

All listed paths are allocation-free or allocation-reduced in steady state with **identical
observable behavior**:

### A. World fast block access (`src/world/World.ts`, `src/world/ChunkManager.ts`)

- `ChunkManager` gains a monotonically increasing `revision` counter incremented by
  `createChunk`, `removeChunk`, and `dispose`.
- `World.getBlock` computes chunk/local coordinates inline (integer floor-div/mod, no tuples)
  and consults a one-entry memo `{revision, cx, cy, cz, chunk}` validated against
  `chunkManager.revision`; on miss it resolves through `getChunk` (cold path) and repopulates.
  A memo hit never touches string keys. `undefined` results are memoized too.
- `isSolid`, `setBlockState`'s coordinate resolution, and `isLoadedAt` use the same inline math.
- Public tuple helpers (`worldToChunk`, `worldToLocal`, `chunkKey`) remain exported unchanged.

### B. Light storage numeric caching (`src/rendering/LightStorage.ts`)

- `WorldLightStorage` replaces its string cache comparison with numeric fields
  `(cacheSx, cacheSy, cacheSz, cacheValid)`; the string key is built only on a true map miss.
  `deleteSection`/`clear` invalidate the cache; `restore` repopulates it.
- `SectionLightStorage.indexFor` computes `x + y*16 + z*256` directly after cheap ordered
  validation that preserves the exact `RangeError` messages and check order of the old
  `assertCoord` (x, then y, then z; non-integers rejected with the same message).

### C. Random-tick selector fixed-arity hashing (`src/simulation/RandomTickSelector.ts`)

- Internal fixed-arity FNV mixer `hash32_6(a,b,c,d,e,f)` performs the identical op sequence as
  `hash32` over six values without allocating. `selectForSection`/`selectEligible` use it.
- `selectEligible` decodes the section index arithmetically
  (`lz = i >>> 8; rem = i & 255; ly = rem >>> 4; lx = rem & 15`) — exactly equivalent to
  `localFromIndex` for indices in `[0,4096)` — and no longer allocates per attempt.
- Exported variadic `hash32` remains for compatibility, implemented over the same constants.

### D. Registry-derived random-tick eligibility table (`src/engine/Game.ts`)

- `Game` lazily builds a `Uint8Array` mapping block id → has-`onRandomTick` (1/0), derived from
  the same `blockRegistry` + `behaviorRegistry` pair used today. Ids beyond the current table
  length fall back to the direct lookup path (preserving any throw for unknown ids) and grow
  the table. Eligibility decisions are bit-identical to direct lookups.

### E. Collision adapter contract preservation (`src/player/PlayerPhysics.ts`)

- Implementation attempted to collapse `shapeWorld.getCollisionShape` to one lookup via
  `registry.isSolid(getBlock(...))`; the full suite proved this changes behavior for
  `WorldAccess` implementations whose `isSolid` is not registry-derived (headless stubs,
  invisible sub-bedrock floor). REVERTED. The two-query contract form is kept and pinned by
  `tests/unit/PlayerPhysicsShapeEquivalence.test.ts`; the spec forbids the single-lookup form.

### F. HUD change-detection writes (`src/ui/HUD.ts`)

- Each chip caches its last rendered string; `textContent` is assigned only when it changes.

## Invariants

- Block reads/writes, light values, selection sequences, collision shapes, and rendered HUD
  text are **bit-identical** to the prior implementation for every input.
- Determinism: random-tick selection remains a pure function of `(seed, section coords, tick, attempt)`.
- Error contracts preserved: `RangeError` messages/classes from light storage; `RegistryError`
  propagation for unknown ids in fallback paths; `Number.isInteger` guards in `World`.
- No public API signature changes; all existing exports keep their names and types.

## API and data model

No persisted data model changes. New internal members only:

```ts
// ChunkManager
get revision(): number;          // bumped on createChunk/removeChunk/dispose

// World (private)
private memoRevision: number;    // -1 initially
private memoCx = NaN; private memoCy = NaN; private memoCz = NaN;
private memoChunk: Chunk | undefined;
```

## Control/data flow

Unchanged. Optimizations only shorten existing lookup paths.

## Detailed behavior

See specs/engine-hot-paths/spec.md requirements R1–R10.

## Failure modes

- Memo staleness: prevented because any chunk-map mutation bumps `revision`, invalidating the
  memo wholesale; coordinates must also match exactly.
- Numeric-cache staleness in light storage: `deleteSection`/`clear` reset `cacheValid`;
  `restore` sets the cache from the last restored section.
- Table drift in Game eligibility: impossible for registered ids (table built from the same
  registries); unknown ids take the legacy path including its exceptions.

## Compatibility/migration

None required; no stored/public data changes.

## Performance/resource constraints

- Steady-state `getBlock`: zero allocations (was 3).
- Light cell access: zero allocations (was 2 objects/strings).
- Random-tick attempts: zero allocations per attempt (was ≥2).
- Benchmarks must demonstrate measurable improvement; recorded in verification.md.

## Testing seams

- Existing headless `World` construction pattern (tests/unit/World.test.ts `makeWorld`).
- `RandomTickSelector` pure functions allow golden-sequence comparison.
- `HUD` accepts a DOM element; tests inject a stub element and count assignments.

## Observability/debugging

No telemetry changes. Benchmark suite provides before/after numbers.

## Affected files/symbols

- src/world/ChunkManager.ts (`revision`)
- src/world/World.ts (`getBlock`, `isSolid`, `setBlockState`, `isLoadedAt`, memo fields)
- src/rendering/LightStorage.ts (`sectionFor`, `indexFor`, cache fields, delete/clear/restore)
- src/simulation/RandomTickSelector.ts (`hash32_6`, `selectForSection`, `selectEligible`)
- src/engine/Game.ts (`tickRandomBlocks`, eligibility table builder)
- src/player/PlayerPhysics.ts (`shapeWorld`)
- src/ui/HUD.ts (chip caches)
- tests/unit/* (new regression tests), tests/bench/hot-paths.bench.ts (new)

## Rejected alternatives

- Packing 3 signed chunk coords into one numeric Map key (collision/precision risk; BigInt slow).
- Replacing ChunkManager's string-keyed map wholesale — wide blast radius across pipeline keys;
  the memo achieves the same hot-path win with a fraction of the risk.
- Caching per-section random-tick eligibility bitmaps keyed by mesh version — staleness risk
  after edits; per-attempt cost reduction is sufficient and exactly deterministic.
- Enabling worker meshing / changing streaming budgets — out of scope, higher risk.

## Downstream dependencies

None; Change 253 (reserved, PLANNED) rewrites world storage later and supersedes parts of this
surface independently.
