# Spec: greedy-opaque-meshing

## Contract

Exposed opaque cube faces in a 16³ section MUST be mergeable into maximal rectangles deterministically.
`greedyMergeOpaqueFaces` MUST merge only faces sharing the same `faceKey`, MUST cover exactly the
exposed faces (equivalence with `enumerateOpaqueFacesNaive`), MUST emit at most as many quads as the
naive enumeration, and MUST produce identical output for identical inputs. A face is exposed when its
cell is opaque and the neighbor across the face is not opaque (or outside the section).

## Definitions

- **Exposed face**: an opaque cell's face whose outward neighbor is not opaque (out-of-section
  neighbors count as not opaque).
- **OpaqueFaceQuad**: `{ face, x, y, z, width, height, blockId }` — one merged rectangle.
- **faceKey**: the merge-compatibility key derived from `(blockId, face)`.

## Invariants

- Merged quads cover exactly the exposed faces; merged count ≤ naive count.
- Cells merge only when their `faceKey` matches.
- Output order is deterministic: faces in `down, up, north, south, east, west`; slices ascending;
  rectangles expanded row-major.
- The quad's `blockId` is the id of the merged cells (all identical by key).

## Requirements

### Requirement: empty section
An all-air section MUST produce no quads.

#### Scenario: empty
- **GIVEN** a sampler returning `null` for every cell
- **WHEN** `greedyMergeOpaqueFaces` runs
- **THEN** the result is `[]`.

### Requirement: single opaque cube
A single opaque cube MUST produce exactly six 1×1 quads (one per face).

#### Scenario: one cube
- **GIVEN** one opaque cell at the section origin
- **WHEN** `greedyMergeOpaqueFaces` runs
- **THEN** the result has 6 quads, each with `width = height = 1`, one per face, at the correct face
  planes.

### Requirement: face merging
Adjacent exposed faces with the same key MUST merge into larger rectangles.

#### Scenario: 2×1×1 slab
- **GIVEN** two adjacent opaque cells along X
- **WHEN** `greedyMergeOpaqueFaces` runs
- **THEN** the `up`/`down`/`north`/`south` faces each merge into one 2×1 quad and the `east`/`west`
  faces stay 1×1 — 6 quads total, covering the 10 exposed faces.

### Requirement: key separation
Cells with different `faceKey`s MUST NOT merge.

#### Scenario: different blocks
- **GIVEN** two adjacent opaque cells with different ids (hence different keys)
- **WHEN** `greedyMergeOpaqueFaces` runs
- **THEN** the shared-direction faces stay two 1×1 quads (no merge).

### Requirement: equivalence and determinism
For any fixture, the merged quads' total area MUST equal the naive enumeration's area, the merged
count MUST be ≤ the naive count, and identical inputs MUST produce identical quad lists.

#### Scenario: fixture matrix
- **GIVEN** several fixture sections (empty, single cube, slab, plain, checkerboard)
- **WHEN** both enumerations run
- **THEN** areas are equal, merged ≤ naive, and repeated runs are identical.

## Error and failure behavior

- Sampler/predicate exceptions propagate (caller bug).

## Performance and resource bounds

O(6 × 16³ × key comparisons) worst case; plains merge to a few quads.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic merging prevents mesh drift; equivalence guarantees no face is lost or invented.

## Observability

Quad lists are directly inspectable.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Empty section | [] |
| Single opaque cube | six 1×1 quads |
| Face merging | 2×1×1 slab → 6 quads |
| Key separation | different ids don't merge |
| Equivalence and determinism | area equality, count ≤, repeatability |
