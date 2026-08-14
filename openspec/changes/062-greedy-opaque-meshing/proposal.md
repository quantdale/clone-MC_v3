# Proposal: 062-greedy-opaque-meshing

## Problem

Opaque chunk meshes are built face-by-face today, producing many quads and draw calls. Adjacent
identical faces (e.g. a flat dirt surface) can be merged into larger rectangles, cutting geometry
massively. No greedy merging primitive exists.

## Goals

- Provide `greedyMergeOpaqueFaces`: merge exposed opaque cube faces within a 16³ section into
  maximal rectangles, merging only faces with the same compatibility key (block id + face).
- Deterministic output: faces iterated in a fixed order, slices in order, rectangles expanded
  row-major.
- Regression equivalence: exported `enumerateOpaqueFacesNaive` + tests proving merged quads cover
  exactly the same exposed faces as the naive enumeration, with ≤ naive quad count.

## Non-goals

- Full vertex/texture-atlas output (063 consumes the quad list and emits vertices).
- Non-opaque (cutout/translucent) meshing (063+ templates handle those).
- Per-block model geometry (063); 062 merges plain opaque cube faces.

## Preconditions

- Change 061 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 061 baseline (711 unit / 19 e2e).

## Dependencies

- 059 `ModelFace` for face naming.

## Proposed change

- `src/rendering/GreedyMesher.ts` (NEW): `OpaqueFaceQuad`, `FaceCellSampler`
  (`getCell(x, y, z) → number | null`), `isOpaque(id)`, `faceKey(id, face)`,
  `greedyMergeOpaqueFaces(...)`, and `enumerateOpaqueFacesNaive(...)`.
- `tests/unit/GreedyMesher.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Merge compatibility is defined by `faceKey`; callers must include the block id (and later the
  texture) so different blocks never merge.
- Face-exposure rules must be consistent with the naive enumeration (equivalence tests enforce).

## Rollback strategy

Revert the commit; the mesher is additive.

## Definition of Done

- Exposed faces are faces of opaque cells whose neighbor on the face side is not opaque.
- Merged quads cover exactly the exposed faces (per `faceKey`); `greedyMerge` count ≤ naive count on
  every fixture; deterministic per input.
- Unit tests cover empty sections, single cubes (6 quads), merged slabs/plains, key separation, and
  equivalence on a fixture matrix.
- Full gate green; 062 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 062 suite; E2E stays 19/19.
