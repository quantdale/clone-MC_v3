# Change Sequence Overrides

## Mandatory pre-241 repository hardening interlock

Before Change 241 (`241-deterministic-replay-suite`) may become ACTIVE or any numbered implementation at 241+ may proceed, the repository MUST complete and VERIFY:

`openspec/hardening/2026-08-17-pre-241-repository-hardening/`

This is an out-of-band safety interlock, not a new numbered parity change. It does **not** renumber or delete Changes 241-250. Ahead-of-time specification artifacts for 241-250 may remain, but production/test implementation for inactive future changes is forbidden by the normal autonomy rules and this interlock.

While the interlock is incomplete:

- numbered advancement is frozen before 241;
- a fresh `/goal`/continue session MUST resume the hardening package rather than activate 241;
- stale `PROGRAM_STATE` “next action” text that would start 241 is subordinate to this interlock;
- the executor MUST rebaseline against current `origin/main`, because SHAs/run IDs recorded in the hardening package are audit observations, not immutable targets.

The interlock may be marked VERIFIED only after its tasks/specs/verification gates are fully evidenced, every tracked path is accounted for by its file audit, blocking findings are closed, the completed hardening commit is published to `origin/main`, and canonical GitHub Actions for that exact SHA is green.

## Directory-name overrides

| Number | Sequence name | Use this directory |
|---|---|---|
| 008 | `008-item-stack-components` | `openspec/changes/008-stack-data-components/` |
| 009 | `009-inventory-stack-migration` | `openspec/changes/009-slot-data-unification/` |

The number, order, and scope are unchanged. Do not create a second implementation under the old slug.

## Incomplete future artifact packages

The following missing files MUST be authored and pass `SPEC_AUTHORING_PROTOCOL.md` before their change becomes ACTIVE:

A missing artifact is a hard pre-implementation block, not completed work.

> Resolved: 006, 007, 008, and 009 have all required artifacts present and are VERIFIED (006–009) or ahead of activation.
> 009's `verification.md` was authored during the 009 implementation session and the change reached VERIFIED 24/24.

For directory resolution this file overrides the slug text in `CHANGE_SEQUENCE.md`. Scope still comes from the numbered change artifacts and sequence outcome.
