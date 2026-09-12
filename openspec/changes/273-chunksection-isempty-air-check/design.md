# Design: 273-chunksection-isempty-air-check

## Context/current state

`ChunkSection` (`src/world/ChunkSection.ts`) wraps a
`PalettedContainer<BlockStateId>` of capacity `SECTION_VOLUME` (4096) with
`defaultValue = airId`. Key behaviors today:

- Constructor registers `airId` as palette ordinal 0 (`paletteSize` starts 1).
- `set`/`setStateId`/`fill` only ever *grow* the palette (no shrink on
  `PalettedContainer.set`); live-built sections therefore carry palette
  `[air, ...]` with size ≥ 2 once any non-air block is written.
- `deserialize` *replaces* the palette wholesale from the payload, so a
  single-entry non-air payload yields `paletteSize === 1` with entry `stone`.
- `isEmpty()` returns `paletteSize === 1` — wrong for that shape.
- `nonAirCount()` returns 0 early when `isEmpty()` is true — wrong by
  transitivity.
- Sole `isEmpty()` consumer: `ChunkMesher.meshSection`
  (`src/world/ChunkMesher.ts:293`) returns all-null streams for "empty"
  sections — wrongly drops solid mono-block sections. No other `src/` caller
  of `isEmpty()`/`nonAirCount()` exists (verified by indexed search:
  `nonAirCount` appears only in `ChunkSection.ts`; section `.isEmpty()` only
  in `ChunkMesher.ts`).

## Target state

```ts
/** True iff every slot is air (single-entry palette whose entry is airId). */
isEmpty(): boolean {
  return this.storage.paletteSize === 1 && this.storage.get(0) === this.airId;
}
```

`nonAirCount()` is unchanged in code (its `isEmpty()` short-circuit becomes
correct by construction; the full scan already compares against `airId`).
Class + method doc comments state the air-only contract explicitly.

## Invariants

- I-1: `isEmpty() === true` ⟺ every one of the 4096 slots holds `airId`.
- I-2: `nonAirCount()` equals the exact number of slots with `id !== airId`
  (0 for all-air, 4096 for all-stone, exact partial counts otherwise).
- I-3: The mesher fast-path triggers ⟺ I-1 holds.
- I-4: Serialization format, palette layout, and public signatures unchanged.

## API and data model

No signature changes. `isEmpty(): boolean` and `nonAirCount(): number` keep
their names, arity, and return types; only the truth value for the
mono-non-air shape changes (false / full count instead of true / 0).

Why `storage.get(0)` and no `PalettedContainer` change: when `paletteSize`
is 1, every slot indexes ordinal 0, so `get(0)` returns the single palette
entry by construction. This avoids widening the container API for one call
site and keeps the production diff to one predicate line plus comments.

## Control/data flow

`meshSection` → `section.isEmpty()` → (true) all-null streams unchanged for
genuine air; (false, now including mono-non-air) full face-culled meshing.
`nonAirCount` → `isEmpty()` short-circuit (true-air fast 0) else O(4096) scan
— same complexity profile as today for every reachable shape.

## Detailed behavior

| Shape | palette | `isEmpty()` pre | `isEmpty()` post | `nonAirCount()` post |
|---|---|---|---|---|
| fresh / all air | `[air]` | true | true | 0 |
| `fill(air)` fresh | `[air]` | true | true | 0 |
| `fill(stone)`→`fill(air)` | `[air, stone]` (stale; palettes never shrink) | false | false (conservative) | 0 (exact scan) |
| `fill(stone)` live | `[air, stone]` | false | false | 4096 |
| mono-stone payload | `[stone]` | **true (bug)** | false | 4096 |
| mixed | `[air, stone, ...]` | false | false | exact |
| mono-air payload | `[air]` | true | true | 0 |

## Failure modes

- Custom-`airId` construction (`new ChunkSection(i, reg, customAir)`): the
  check compares against `this.airId`, so a section full of the custom air
  still reports empty and a section full of another block does not. Covered
  by an explicit unit case.
- Empty palette (`paletteSize === 0`): unreachable (constructor always
  registers the default; deserialize of a well-formed payload always carries
  ≥ 1 entry). The `=== 1` guard fails closed (false) for size 0, which routes
  to the full scan — safe direction.

## Compatibility/migration

Byte-identical serialized form; no migration. Old saves containing
single-palette non-air sections (previously invisible/unmeshed/uncounted)
now mesh and count — the intended fix.

## Performance/resource constraints

`isEmpty()` gains one indexed array read (O(1), no allocation) on the
`paletteSize === 1` path only; multi-entry sections short-circuit on the
first condition as before. `nonAirCount()` profile unchanged. Mesher hot path
unchanged for live-built sections.

## Testing seams

- `tests/unit/ChunkSection.test.ts`: new `describe` block `isEmpty air-check
  (273)` constructing mono payloads via hand-built
  `SerializedPalettedContainer` (`{ version: 1, capacity: 4096, bitsPerEntry:
  4, palette: [stone.id], storage: zeros }`) plus `fill`/round-trip cases.
- Failing-first: new mono-stone tests run red pre-fix (`isEmpty() === true`,
  `nonAirCount() === 0`), green post-fix.
- Mesher behavior: covered transitively (fast-path predicate is `isEmpty()`
  itself); plus an explicit `ChunkMesher.test.ts`-local assertion only if the
  existing suite lacks an empty-section case (audit first, no duplicate).

## Observability/debugging

No new logging. Unit tests print the pre/post verdict table into
verification.md as characterization evidence.

## Affected files/symbols

- `src/world/ChunkSection.ts`: `isEmpty()` predicate + doc comments
  (`nonAirCount` logic untouched).
- `tests/unit/ChunkSection.test.ts`: new 273 block (only test addition).
- `openspec/hardening/.../risk-register.md`: R-8 row → CLOSED.
- `PARITY_MATRIX.md`: C273 exact row + counts.
- Control plane: `CHANGE_SEQUENCE.md`, `CHANGE_SEQUENCE_OVERRIDES.md`,
  `openspec/PROGRAM_STATE.json`/`.md`.

## Rejected alternatives

- Palette-shrink/compaction on `set`/`fill`: larger blast radius, changes
  serialization timing and hot-path costs; unnecessary — the predicate fix is
  exact for every reachable shape.
- Exposing `paletteEntry(0)` on `PalettedContainer`: new public API for one
  call site; `get(0)` is provably equivalent when size is 1.
- Touching `ChunkMesher.ts`: it already implements the correct policy
  ("skip iff empty"); fixing the predicate fixes the consumer with zero
  mesher diff.

## Downstream dependencies

None beyond the mesher fast-path. `ChunkColumn`/streaming code does not call
`isEmpty()`/`nonAirCount()` (verified by search). No 259–272 surface depends
on the buggy verdict.
