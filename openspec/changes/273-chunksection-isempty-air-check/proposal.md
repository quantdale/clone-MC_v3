# Proposal: 273-chunksection-isempty-air-check

## Problem

`ChunkSection.isEmpty()` (`src/world/ChunkSection.ts:85-87`) returns
`paletteSize === 1`, which is true for a section filled entirely with *any*
single block (e.g. all stone), not only air. `nonAirCount()` short-circuits to
0 when `isEmpty()` is true, and the mesher empty fast-path
(`src/world/ChunkMesher.ts:293`) skips meshing entirely for such sections.

This is the remaining R-8 latent ("ChunkSection.isEmpty single-palette-as-air").
The in-memory path rarely exhibits it (a live `fill(stone)` leaves palette
`[air, stone]`, size 2), but the deserialize path does: a serialized
single-palette non-air section (palette `[stone]`, size 1 — e.g. written by an
external tool, a future compaction, or any hand-built payload) restores as
"empty", reports `nonAirCount() === 0`, and meshes to nothing: solid terrain
silently invisible after a chunk reload.

## Goals

- `isEmpty()` is true iff the section is entirely air.
- `nonAirCount()` counts correctly for mono-non-air sections.
- The mesher fast-path still skips true air sections and meshes solid
  mono-block sections (correctness fix, documented even if output changes).
- Unit proofs: all-air true, all-stone false, mixed false, fill(air)/fill(stone),
  serialize round-trip preservation of the verdict.
- Close risk-register R-8 (isEmpty half; brewing half already closed by 260).

## Non-goals

- No palette compaction / palette-shrink machinery in `PalettedContainer`.
- No gameplay, simulation, persistence-format, or API-signature change.
- No visual-golden re-pin unless the gate proves churn (none expected: live
  worldgen builds multi-entry palettes, so the live mesher path is unchanged;
  only the deserialize shape changes behavior).
- No 258 headed work; 259–272 stay VERIFIED and untouched.

## Preconditions

- Session start at `origin/main` `93de62ff51c9146a80925adbde5d2e9929e4a088`
  (fetched; local HEAD equal).
- 272 VERIFIED 10/10; 258 BLOCKED intact; 259–271 VERIFIED.

## Dependencies

- `src/world/ChunkSection.ts` (fix site).
- `src/data/PalettedContainer.ts` (palette semantics; read-only dependency,
  no change expected).
- `src/world/ChunkMesher.ts` (sole `isEmpty()` consumer; no change expected —
  it already does the right thing once `isEmpty()` is truthful).
- `tests/unit/ChunkSection.test.ts` (proof site).

## Proposed change

One-predicate fix: `isEmpty()` returns true iff `paletteSize === 1` AND the
single palette entry is `airId` (observed via `storage.get(0)`, which reads
palette ordinal 0 — the only ordinal present when size is 1). `nonAirCount()`
keeps its `isEmpty()` short-circuit (now correct) plus its full scan; doc
comments updated to state the air-only contract. No `PalettedContainer` change.

## Compatibility and migration

No stored-data change: serialization format, palette layout, and API
signatures are byte-identical. Old saves load exactly as before; sections that
were wrongly classified empty now correctly report non-empty and mesh.

## Risks

- A mono-stone section that was wrongly skipped by the mesher now meshes:
  that is the intended correctness fix, not a regression. Documented in
  verification.md; zero golden churn expected and proven by the full e2e.
- `storage.get(0)` relies on paletteSize 1 ⇒ all slots share ordinal 0; this
  is structural to `PalettedContainer` (single-entry palette means every slot
  indexes ordinal 0). Pinned by unit tests.

## Rollback strategy

Revert the one-predicate diff in `ChunkSection.ts` plus the test block; R-8
returns to "isEmpty latent remains".

## Definition of Done

- Failing-first characterization recorded (mono-non-air payload reports
  `isEmpty() === true` pre-fix).
- Fix landed; all-air true / all-stone false / mixed false / fill(air) true /
  fill(stone) false with full counts / round-trip verdict preservation proven
  in `tests/unit/ChunkSection.test.ts`.
- Mesher fast-path audited: skips true air, meshes solid mono-block.
- R-8 marked CLOSED (isEmpty half) with evidence pointer.
- Full baseline gate green: typecheck, lint, unit, build, e2e (incl. visual
  matrix zero-churn), file-audit, validate-state.
- PARITY_MATRIX.md C273 exact row; PROGRAM_STATE 273 VERIFIED; published to
  `origin/main`. Then STOP (no 274+).

## Advancement gate

Target 100% (10/10). Floor 90% only via explicit Advancement Exception proving
every incomplete task non-blocking with no MUST/SHALL unverified. Required
tests must pass; no data-loss/corruption/determinism/compatibility/security
blocker may remain.
