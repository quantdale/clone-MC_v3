# Design: 021-section-coordinate-model

## Context / current state

Section/chunk storage (planned 023/024) needs correct 16×16×16 section coordinate math. Current code
has no shared helper, and `Math.floor`/`%` handling of negatives is error-prone.

## Target state

`src/math/SectionCoordinate.ts` provides pure, deterministic conversion between world coordinates and
16×16×16 section coordinates, plus in-section local indexing. All functions are correct for negative,
zero, and positive coordinates.

## Invariants

- `SECTION_SIZE === 16`; local coordinates MUST be in `[0, 16)`.
- `sectionIndex(coord) === Math.floor(coord / 16)` (correct for negatives).
- `localCoord(coord) === ((coord % 16) + 16) % 16` (always non-negative, in `[0, 16)`).
- `sectionIndex(coord) * 16 + localCoord(coord) === coord` for every integer `coord`.
- `localIndex(lx, ly, lz) === lx + ly * 16 + lz * 256`, MUST be in `[0, 4096)`.
- `localFromIndex` MUST be the exact inverse of `localIndex`.

## API and data model

```ts
export const SECTION_SIZE = 16;
export const SECTION_VOLUME = SECTION_SIZE * SECTION_SIZE * SECTION_SIZE; // 4096

export function sectionIndex(coord: number): number;
export function localCoord(coord: number): number;
export function worldToSectionLocal(coord: number): { section: number; local: number };

export interface SectionCoord {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
}

export interface LocalCoord {
  readonly localX: number; // [0,16)
  readonly localY: number; // [0,16)
  readonly localZ: number; // [0,16)
}

export function worldToSection(x: number, y: number, z: number): SectionCoord;
export function worldToLocal(x: number, y: number, z: number): LocalCoord;

export function localIndex(localX: number, localY: number, localZ: number): number;
export function localFromIndex(index: number): LocalCoord;

export class SectionCoordinates {
  constructor(public readonly sectionX: number, public readonly sectionY: number, public readonly sectionZ: number);
  localIndexAt(localX: number, localY: number, localZ: number): number;
}
```

## Control / data flow

All functions are pure. `worldToSection` applies `sectionIndex` per axis; `worldToLocal` applies
`localCoord` per axis; `localIndex` packs `lx + ly*16 + lz*256`. No allocations beyond small objects.

## Failure modes

Inputs are numbers; non-integer/NaN inputs are out of scope (callers provide integers). `localIndex`
does not range-check by contract but is only fed in-range locals by `SectionCoordinates`.

## Compatibility / migration

Purely additive math; no persisted or call-site changes.

## Performance / resource constraints

O(1) arithmetic; no allocations in hot paths beyond the tiny returned objects.

## Testing seams

`tests/unit/SectionCoordinate.test.ts` exhaustively checks round-trips and negative coordinates:
`worldToSectionLocal` for -1, -16, -17, 0, 15, 16, 31, 32; local index packing/unpacking for corner
and center positions; and the identity `section*16 + local === coord`.

## Affected files / symbols

- `src/math/SectionCoordinate.ts` (new)
- `tests/unit/SectionCoordinate.test.ts` (new)

## Rejected alternatives

- Using `Math.trunc` or `coord >> 4`: wrong for negatives (sign-extends incorrectly). `Math.floor`
  with modulo normalization is the correct, portable choice.
- Storing sections as raw arrays keyed by local index: deferred to 023/024; this change only provides
  the coordinate math.

## Downstream dependencies

023/024 (paletted/section/column storage) and 026 (vertical world access) use this conversion for
world↔section↔local addressing.
