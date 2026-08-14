# Verification: 084-fluid-regression-suite

Status: VERIFIED
Completion: 100%
Advancement allowed: true

084 started only after 083 was VERIFIED (430c49a / cbab175).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Corridor fill | source at x=0 fills cells 1..7 with levels 1..7, cell 8 empty; per-cycle timing asserted (cell k reaches level k on cycle k — the fixture's exact deterministic claim); steady ≤ 9 cycles, total processed ≤ 50 | PASS |
| Waterfall pool | elevated source → falling column (4..2 at level 8), base level 6, four pool neighbors level 7; steady ≤ 12 cycles, processed ≤ 40 | PASS |
| Source pool formation | two sources with a gap → the gap cell becomes level 0 (source); both sources stay | PASS |
| Decay after removal | source cell replaced by unfed flowing water and the corridor re-seeded (neighbor updates) → every cell dries to empty within 40 cycles | PASS |
| Boundaries | world-corner source spreads only in-bounds (no negative-coordinate writes); L-shaped wall pocket contains the water (inside filled, walled-off cells empty) | PASS |
| Unload/reload | 047 queue serialize → fresh queue deserialize → continue: final world snapshot equals the straight-through control run | PASS |
| Bounded work | 64×64 basin, maxPerTick 50: filled region is exactly the manhattan diamond (distance ≤ 7 from the center source), steady ≤ 60 cycles, total processed ≤ 20000, two runs identical (snapshots, cycles, processed) | PASS |
| Determinism | identical fixtures → identical snapshots and counts (64×64 double run) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/FluidRegression.test.ts` | PASS | 9/9 |
| `npm test` | PASS | 96 files, 954/954 (945 baseline + 9 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.35s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- The wiring encodes the integration pattern (077 handler = 078 water step → 080 contact checks in fixed 6-neighbor order → waterlogging interception via the world → re-schedule affected + horizontal neighbors). A wiring defect found during development — feeder changes not reaching sustained cells, freezing decay waves — was fixed by scheduling affected cells' horizontal neighbors (deterministic neighbor updates); the decay fixture now dries to empty.
- Waterlogged cells read as level-0 sources for flow and feed downstream cells (verified: cell beyond the slab reaches level 1).
- Water/lava contact during flow: the lava source is consumed (obsidian placement path exercised via the wiring; fluids cleared).
- Bounds, walls, edges, and round-trip continuity all assert exact final states — no wall-clock assertions anywhere.

## Migration / compatibility validation

Test-only change: no production files modified. 076-083 and 047 consumed as-is; the suite is the future world-wiring's regression oracle.

## Performance / resource validation

No wall-clock assertions; deterministic work counts (processed events, dispatch cycles) bound the largest fixture (64×64, maxPerTick 50). Suite runs in ~0.7s.

## Regressions

None. Full baseline gate green: typecheck, lint, unit 954/954 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 084 deterministic fluid regression fixtures (flow, boundaries, unload/reload, bounded work) close the fluid section. Advance to 085-worldgen-stage-pipeline.
