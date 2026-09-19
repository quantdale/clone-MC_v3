# Verification: 281-workstation-ui

Status: NOT VERIFIED
Progress: 0/12 (0%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Stable smoker identity and shape | Not run | PENDING |
| Twice-fast delegated context | Not run | PENDING |
| Type-safe smoker payload | Not run | PENDING |
| Authoritative host lifecycle | Not run | PENDING |
| Live station-labelled panel | Not run | PENDING |
| Atomic menu and lifecycle | Not run | PENDING |
| Persistence/break/no-duplication | Not run | PENDING |
| Scope and compatibility guard | Not run | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npm test` | NOT RUN | |
| `npm run build` | NOT RUN | |
| `npm run test:e2e` | NOT RUN | |
| `node scripts/validate-file-audit.mjs openspec/hardening/2026-08-23-exhaustive-repository-certification/file-audit-manifest.json` | NOT RUN | |
| `npm run validate-state` | NOT RUN | |

## Edge/adversarial validation

Pending implementation and focused tests for odd/zero/unknown recipes,
foreign type keys, malformed payload quarantine, duplicate coordinates, stale
blocks, blocked output, cursor settlement, and repeated removal.

## Migration/compatibility validation

Pending. The intended contract is an additive `smoker` type in the existing
`block-entities` array with no new namespace or schema migration.

## Performance/resource validation

Pending. The intended implementation adds no headed/GPU work and no per-frame
or world-generation path.

## Regressions

Pending. Existing 259–280 behavior, including furnace, brewing, shield,
trading, and death/respawn journeys, must remain green.

## Incomplete tasks

T1–T12 are pending.

## Advancement Exception

Not applicable; target completion is 100%.

## Final decision

NOT VERIFIED — implementation and all required evidence are pending.
