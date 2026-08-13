# Verification: 002-resource-id-foundation

Status: **NOT VERIFIED**

Completion: **0% until implementation tasks are executed and evidenced**

Advancement allowed: **false**

Advancement exception used: **false**

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Qualified parsing | `ResourceId` focused tests | PENDING |
| Explicit default namespace | focused tests | PENDING |
| Namespace validation | legal/illegal table tests | PENDING |
| Path validation | legal/illegal table tests | PENDING |
| Separator validation | empty/malformed separator tests | PENDING |
| Shared validation | parse/direct-create equivalence tests | PENDING |
| Immutable identity | representation-specific test/inspection | PENDING |
| Canonical round trip | table-driven round-trip tests | PENDING |
| Equality | independent-value tests | PENDING |
| Deterministic ordering | ordering tests | PENDING |
| Structured strict failure | error reason assertions | PENDING |
| Non-throwing try-parse | invalid/valid tests | PENDING |
| Additive compatibility | diff inspection + repository regressions | PENDING |

## Baseline commands

Run and record before implementation where practical:

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npm test` | NOT RUN | |
| `npm run build` | NOT RUN | |
| `npm run test:e2e` | NOT RUN | |

## Focused implementation validation

Record the exact focused ResourceId test command and test count after implementation. The focused suite must exercise all syntax classes and error paths in the capability spec.

## Edge/adversarial validation

Pending:

- empty input/components;
- malformed separators;
- uppercase and whitespace;
- unsupported/non-ASCII characters;
- invalid default namespace;
- direct-create/parser consistency;
- repeated parse/serialize round trip;
- no shared-state mutation on failure.

## Compatibility validation

Pending diff inspection proving:

- no current `BlockId` numeric changes;
- no block key migration;
- no recipe ID migration;
- no save/localStorage schema migration;
- no new runtime dependency.

## Final regression gate

All required before VERIFIED:

- focused ResourceId tests PASS;
- `npm run typecheck` PASS;
- `npm run lint` PASS;
- `npm test` PASS;
- `npm run build` PASS;
- `npm run test:e2e` PASS;
- no accidental later-change scope in diff.

## Incomplete tasks

All implementation/validation tasks are initially incomplete. Recompute from `tasks.md`; never estimate.

## Advancement Exception

Not applicable while completion is below 90%. No task is planned as optional; expected outcome is 100%.

## Final decision

**BLOCKED FROM ADVANCING BY DESIGN UNTIL IMPLEMENTED AND VERIFIED.** Do not start 003.
