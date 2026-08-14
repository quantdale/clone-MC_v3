# Verification: 068-blocklight-propagation

Status: VERIFIED
Completion: 100% (4/4 tasks)
Advancement allowed: true

068 started only after 067 was VERIFIED (169ac97 / 95fb0e3), implemented once 067's artifacts and the
validated 067 baseline (749 unit / 19 e2e) were confirmed. The 068 OpenSpec package was authored from
scratch per `SPEC_AUTHORING_PROTOCOL.md` (no prior 068 artifacts existed) because luminance-source
block-light propagation is the next change in `CHANGE_SEQUENCE.md`.

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Source falloff | Test: torch (lum 14) at (8,8,8) — 14 at source, 13/12 at distance 1/2, 0 at distance 16. | PASS |
| Opaque sources emit | Test: an opaque glowstone cell reads 15 and its air neighbor reads 14. | PASS |
| Propagation around corners | Test: light bends around a partial wall; the around-corner cell is lit while the wall cell is 0. | PASS |
| Opaque walls block light | Test: a full vertical wall leaves the far side at 0 while the source side stays 14. | PASS |
| Determinism | Test: identical torch worlds produce identical snapshots. | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean. |
| `npm run lint` | PASS | `eslint .` clean. |
| `npx vitest run tests/unit/BlockLightEngine.test.ts` | PASS | 5/5 new tests. |
| `npm test` | PASS | 754/754 (prior 749 + 5 new), stable across repeated runs. |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean. |
| `npm run test:e2e` | PASS | 19/19. |

## Edge / adversarial validation

- Sources are seeded regardless of opacity; propagation never reduces a source (value comparison
  only raises).
- Propagation only raises values (≤ 15), guaranteeing BFS termination.

## Migration / compatibility validation

Additive; no consumers yet and no existing behavior changes.

## Performance / resource constraints

O(cells × 15) worst case; emitters are typically sparse.

## Regressions

- Prior 067 suite (5), 066 (8), 065 (6), 064 (6), 063 (7), 062 (6), 061 (6), 060 (5), 059 (6),
  058 (6), 057 (7), 056 (7), 055 (7), 054 (9), 053 (7), 052 (7), 051 (6), 050 (5), 049 (6),
  048 (8), 047 (8), 046 (6), 045 (7), 044 (6), 043 (7), 042 (5), 041 (10), 040 (11), 039 (7),
  038 (7), 037 (16), 036 (16), 035 (14), 034 (14) still green; full unit suite 749→754. Production
  build unchanged in footprint; E2E unchanged at 19/19.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable; completion is 100%.

## Final decision

Change 068 is **VERIFIED** at 4/4 (100%). All gates green: typecheck, lint, new 068 suite (5/5), full
unit suite (754/754, stable), production build, and E2E (19/19). No advancement exception required.
Advancement to 069-incremental-light-updates (next change in `CHANGE_SEQUENCE.md`) authorized.
