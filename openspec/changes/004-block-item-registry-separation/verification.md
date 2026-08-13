# Verification: 004-block-item-registry-separation

Status: **PLANNED / NOT VERIFIED**

Completion: **0% until activated and implemented**

Advancement allowed: **false**

## Entry gate

004 implementation MUST NOT start until 003 is VERIFIED and program state activates 004.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Independent block/item registries | focused registry tests | PENDING |
| Explicit placement relation | interaction tests | PENDING |
| Item-owned tool metadata | mining/item tests | PENDING |
| Item-referenced drops | drop tests | PENDING |
| Legacy numeric compatibility | full current-ID table + save fixtures | PENDING |
| Duplicate/unknown legacy safety | negative tests | PENDING |
| Current behavior preservation | unit + E2E regression | PENDING |
| Cross-reference validation | initialization tests | PENDING |

## Required regression commands

- focused block/item separation tests;
- focused old-save compatibility tests;
- `npm run typecheck`;
- `npm run lint`;
- `npm test`;
- `npm run build`;
- `npm run test:e2e`.

## Compatibility checks

Before VERIFIED, record evidence that current persisted numbers retain meaning, no generic runtime ID is persisted, and the snapshot version/shape is unchanged in 004.

## Scope audit

Diff MUST NOT introduce tag behavior, generalized block-state properties, item-component stack migration, recipe schema migration, or fluid separation belonging to later changes.

## Advancement Exception

Not planned. Because 004 is an identity/persistence-compatibility migration, unresolved compatibility tasks are blocking even above 90%.

## Final decision

**NOT ELIGIBLE TO ADVANCE.** 005 remains blocked until 004 reaches its full verification gate.
