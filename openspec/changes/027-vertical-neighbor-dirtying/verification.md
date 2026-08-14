# Verification: 027-vertical-neighbor-dirtying

Status: **VERIFIED**

Advancement allowed: **true**

027 started only after 026 was VERIFIED.

## Evidence

| Requirement | Result |
| --- | --- |
| `ChunkColumn.markSectionDirty` flags in-range section, no allocation | PASS — `markSectionDirty(2)` yields dirty `[2]`; out-of-range `99`/`-1` ignored, `isDirty` stays false |
| Boundary write propagates to all six neighbor sections | PASS — left/right horizontal neighbors flagged at `sy`; vertical-up/down flagged at `sy±1` of the same column |
| Non-boundary write leaves neighbors clean | PASS — interior write at `(8,8,8)` leaves the four horizontal + vertical neighbors all clean |
| Propagation only touches existing neighbor columns | PASS — boundary write with a sole column leaves `size` at 1 and the absent neighbor unmaterialized |
| Out-of-range vertical neighbor no-op | PASS — block at `y=319` (top section `sy=23`, `localY=15`) flags only the written section, not `sy+1` |
| Written section stays dirty | PASS — written `sy` remains in the dirty set after a boundary write |
| typecheck | PASS |
| lint | PASS |
| full unit suite | PASS 432/432 (prior 422 + 10 new VerticalNeighborDirtying tests) |
| production build | PASS as the Playwright webServer prerequisite |
| E2E | PASS 19/19 |

No advancement exception was needed. Expected completion is 100%; achieved 100%.

## Gate table

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx vitest run tests/unit/VerticalNeighborDirtying.test.ts` | PASS 10/10 |
| `npm test` | PASS 432/432 |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS 19/19 |

## Next

028-section-mesh-versioning is unblocked and may now be activated.
