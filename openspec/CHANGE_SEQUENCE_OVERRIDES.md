# Change Sequence Overrides

## Directory-name overrides

| Number | Sequence name | Use this directory |
|---|---|---|
| 008 | `008-item-stack-components` | `openspec/changes/008-stack-data-components/` |
| 009 | `009-inventory-stack-migration` | `openspec/changes/009-slot-data-unification/` |

The number, order, and scope are unchanged. Do not create a second implementation under the old slug.

## Incomplete future artifact packages

The following missing files MUST be authored and pass `SPEC_AUTHORING_PROTOCOL.md` before their change becomes ACTIVE:

- 006: missing `tasks.md`.
- 007: missing `verification.md`.
- 008: complete design/tasks/spec/verification are still required beyond its proposal.
- 009: missing `verification.md`.
- 011: missing `verification.md`.

A missing artifact is a hard pre-implementation block, not completed work.

For directory resolution this file overrides the slug text in `CHANGE_SEQUENCE.md`. Scope still comes from the numbered change artifacts and sequence outcome.
