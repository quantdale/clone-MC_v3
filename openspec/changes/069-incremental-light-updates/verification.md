# Verification: 069-incremental-light-updates

Status: VERIFIED
Completion: 100%
Advancement allowed: true

069 started only after 068 was VERIFIED (2749b10 / 219c5aa).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Placement darkens | `LightUpdateEngine.test.ts` "darkens cells that depended on the edited cell when a block is placed": shaft world, block at (8,8,8) → cells (8,1..7,8) sky 0, above keeps 9; also "block and unblock a shaft" equivalence fixture | PASS |
| Breaking lights up | "lets light back in when a block is broken": shaft restored (7/4/1/0 down the column); "lets sky light into a basement when the ground is broken" ((8,0,8)=8, (8,-1,8)=7, (8,-2,8)=6); "break a hole in the ground into a basement" fixture | PASS |
| New sources propagate | "propagates from a newly placed light source" (14 at source, 13/12/11 along axes, sky untouched); "place a torch" fixture; opaque emitter (glowstone) 15/14 + sky 0 | PASS |
| Equivalence on fixtures | `it.each` over 14 fixtures (open sky, ground, basement pit, no-op break, shaft block/unblock, torch place/remove, glowstone, opaque emitter, wall, block-above-torch, compound 4-edit sequence, world edges/corners, sealed cave with torch+ceiling+removal): incremental `updateLightAfterEdit` snapshot === fresh full recompute snapshot (067 `computeSkyLight` + 068 `computeBlockLight`) | PASS |
| Determinism | "is deterministic across identical worlds and edits" (compound sequence, snapshot equality); fixed neighbor order + FIFO in both phases | PASS |

Additional edge coverage: no-op edit in a dark sealed cave (light map unchanged); place-then-break restores the exact previous snapshot; independent light paths survive a placement ("does not darken cells with an independent light path": 13/12 kept, 10 bent values on the shadowed side); negative-Y world (minY=-6 cave, minY=-3 basement); world corners (0,0,0), (15,15,15), (15,0,15); removal of a source stops propagation; block-light removal never dims surviving sources (torch re-seeded at full luminance).

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/LightUpdateEngine.test.ts` | PASS | 25/25 |
| `npm test` | PASS | 81 files, 779/779 (754 baseline + 25 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.40s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Removal start on a cell whose light is 0 (break below an opaque surface / dark sealed cave) is a no-op; the re-add phase fills the region from surviving lit cells — covered by the basement, no-op-break and sealed-cave fixtures.
- Removal keeps cells with independent (≥ level) light — covered by the two-torch wall fixture (values 13/12 survive) and by the shadowed-side bent-light assertions (10 on both sides).
- Opaque sources (glowstone) are zeroed for sky by removal and re-seeded for block by the luminance pass; propagation never enters opaque cells.
- World boundaries (x/z edges, y=minY/maxY-1, negative Y) exercised via edge/corner and cave/basement fixtures; `inBounds` guards mirror 067/068.
- Sequential edits (4-edit compound sequence; cave torch→ceiling→torch-removal) stay equivalent to a full recompute of the final state.

## Migration / compatibility validation

Additive — new module `src/rendering/LightUpdateEngine.ts` + new test file; no existing module or test modified. No consumers yet (wiring lands with a later change).

## Performance / resource validation

Removal is local to the affected region (BFS stops at opaque cells and cells with independent light); re-add is O(cells × 15) worst case, bounded. No per-edit full recompute. Unit suite duration unchanged (~7.5s, 81 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 779/779 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 069 `updateLightAfterEdit` (removal + re-add per light type, deterministic) equals a full sky+block recompute on every fixture. Advance to 070-light-aware-meshing.
