# Change Sequence Overrides

## Mandatory post-250 production-persistence hardening interlock

> **STATUS: VERIFIED (2026-08-23).** Every task in the package is complete (78/78);
> `249-DL-001`, `249-DL-002`, and `249-DL-005` are `resolved` with current production-path
> evidence (`post-hardening-audit.md`, including NEW-1..NEW-6 and the PH-7 incremental pass over
> the published delta); Gates A–F are PASS in the package's `verification.md`; the remediation
> checkpoint **`aa92a5c229a753f10f8c1677e836136962b5d07a`** is published to `origin/main`
> (refetch-proved); canonical GitHub Actions for that exact SHA is SUCCESS (**run 32589457819**,
> gate job 97078975848, e2e job 97078975868); and
> `openspec/evidence/release-readiness-post-hardening.md` records verdict **READY**, explicitly
> superseding the historical Change 250 decision. The release-authority supersession below is now
> historical context: current authority is the READY artifact. The numbered-change rules in this
> section (no Change 251, no renumbering/rewriting of 001–250 artifacts) remain in force.

The historical Change 250 (`250-final-program-verification`) `READY` / `COMPLETE` decision is superseded **for current release authority** by this mandatory out-of-band campaign:

`openspec/hardening/2026-08-21-post-250-production-persistence-hardening/`

This interlock exists because Change 249 confirmed blocking data-loss findings `249-DL-001` and `249-DL-002` plus root integration gap `249-DL-005`, and the published Change 250 tree left those production paths unchanged while dispositioning the blockers as `accepted`.

This is not Change 251 and does not renumber, delete, or rewrite the historical 001-250 program/evidence archive. Historical Change 250 artifacts remain evidence of the pre-remediation decision; they are not the current release-readiness authority while this interlock is incomplete.

While this interlock is incomplete:

- the repository MUST be treated as **not release-ready**, regardless of stale/historical `READY`, `COMPLETE`, `nextChange: null`, or "autonomous loop stops here" text;
- a fresh `/goal`, `continue`, or autonomous-development session MUST resume this hardening package before stopping for terminal program state;
- `249-DL-001`, `249-DL-002`, and `249-DL-005` may not be closed by acceptance, deferral, waiver, rarity arguments, documentation-only scope, or severity relabeling;
- production remediation, migration compatibility, end-to-end durability testing, affected-finding re-audit, full regression/performance gates, publication, and canonical exact-SHA CI proof are mandatory;
- the executor MUST rebaseline against current `origin/main`; SHAs/file lines in the package are entry evidence, not immutable targets.

The interlock may be marked VERIFIED only after every task/spec requirement in its package is satisfied, DL-001/DL-002/DL-005 are `resolved` with current production-path evidence, no blocking data-loss/corruption/security/regression finding remains, the remediation checkpoint is published to `origin/main`, canonical GitHub Actions for that exact SHA is SUCCESS, and a post-hardening release-readiness artifact explicitly supersedes the historical Change 250 READY decision.

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
