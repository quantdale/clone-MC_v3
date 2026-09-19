# Verification: 280-death-respawn-ui

Status: NOT VERIFIED
Progress: 2/10 (20%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Safe cause mapping | pending | PENDING |
| Normal respawn card | pending | PENDING |
| Hardcore spectator card | pending | PENDING |
| Lifecycle and persistence non-interference | pending | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PENDING | — |
| `npm run lint` | PENDING | — |
| `npm test` | PENDING | — |
| `npm run build` | PENDING | — |
| `npm run test:e2e` | PENDING | — |
| file-audit | PENDING | — |
| `npm run validate-state` | PENDING | — |

## Edge/adversarial validation

PENDING — reason normalization, missing DOM, repeated dismissal, and
pointer/container lifecycle still require tests.

## Migration/compatibility validation

PENDING — no persistence change is intended; existing death/save regression is
required.

## Performance/resource validation

PENDING — presentation must remain event-only with no fixed-tick DOM writes.

## Regressions

PENDING — the 259–279 regression and full gates have not run for 280.

## Incomplete tasks

T1–T10 are incomplete except for the activation/package control-plane work
represented by T1–T2 being authored in this checkpoint.

## Advancement Exception

Not applicable; target completion is 100%.

## Final decision

NOT VERIFIED.
