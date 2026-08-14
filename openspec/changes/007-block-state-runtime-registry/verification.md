# Verification: 007-block-state-runtime-registry

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence (planned) | Status |
|---|---|---|
| Complete legal state set (Cartesian, empty=1) | `tests/unit/BlockStateRegistry.test.ts`: empty-schema block => 1 state; boolean => 2; boolean+3-value => 6 | PENDING |
| Deterministic enumeration | repeated construction yields identical state order/IDs | PENDING |
| Default state (exactly one, valid) | default-state lookup per block; invalid default fails construction | PENDING |
| Dense runtime IDs | `stateIdToState`/`stateToId` round trip; O(1) direct array lookup | PENDING |
| Complete assignment lookup | lookup by full assignment round trips; missing/extra/illegal fails | PENDING |
| Immutable property transition | `with(property, value)` returns canonical target; states not mutated | PENDING |
| Cross-block safety | property/assignment from another block rejected | PENDING |
| State-count bound | per-block limit; overflow rejected before full allocation | PENDING |
| Construction atomicity | invalid default/assignment/overflow exposes no partial registry | PENDING |
| Deterministic debug form | stable `block[prop=val,...]` text; not parsed on hot path | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PENDING | |
| npm run lint | PENDING | |
| npm test (focused suite) | PENDING | new BlockStateRegistry tests |
| npm run build | PENDING | |
| npm run test:e2e | PENDING | 19/19 baseline must hold |

## Edge/adversarial validation

- Oversized Cartesian product rejected before allocation.
- Unknown property, illegal value, incomplete assignment, extra assignment all fail.
- Invalid default configuration fails registry construction (no partial state).
- Cross-block `with`/assignment rejected.

## Migration/compatibility validation

- Confirm current world chunk storage and save payloads are NOT migrated by 007.
- Existing empty-schema blocks preserve current behavior (one default state each).

## Performance/resource validation

- State-ID lookup O(1); transition/assignment lookup O(1) or bounded by property count; no per-frame Cartesian recomputation.

## Regressions

- 006 property-schema behavior unchanged (BlockPropertySchema tests stay green).
- Full unit suite (200+) and E2E (19/19) pass.

## Incomplete tasks

All 25 tasks in `tasks.md` are pending until implementation lands.

## Advancement Exception

Not applicable unless completion is 90-99.99%.

## Final decision

NOT ELIGIBLE TO ADVANCE until implemented and the gate passes.
