# Tasks: 005-tag-registry

> PLANNED. Implementation starts only after 004 is VERIFIED.

## 1. Entry
- [x] 1.1 Confirm 004 verification and activate 005.
- [x] 1.2 Run and record baseline checks.

## 2. Model and resolution
- [x] 2.1 Define a typed tag bound to one registry domain.
- [x] 2.2 Support direct ResourceId members.
- [x] 2.3 Support nested same-domain tag references.
- [x] 2.4 Reject duplicate tag definitions.
- [x] 2.5 Add explicit tag finalization.
- [x] 2.6 Validate direct members exist.
- [x] 2.7 Validate nested tags exist.
- [x] 2.8 Resolve transitive membership.
- [x] 2.9 Deduplicate repeated/transitive members.
- [x] 2.10 Detect self-cycles.
- [x] 2.11 Detect multi-tag cycles.
- [x] 2.12 Ensure failed finalization exposes no partial resolved state.
- [x] 2.13 Cache resolved membership for normal queries.
- [x] 2.14 Freeze resolved tag data after successful finalization.

## 3. Query behavior
- [x] 3.1 Implement tag lookup/existence.
- [x] 3.2 Implement fast membership query.
- [x] 3.3 Implement deterministic resolved-member iteration.
- [x] 3.4 Keep registry domains type-separated.

## 4. Tests
- [x] 4.1 Test direct membership.
- [x] 4.2 Test nested membership across multiple levels.
- [x] 4.3 Test deduplication and deterministic order.
- [x] 4.4 Test missing direct member.
- [x] 4.5 Test missing nested tag.
- [x] 4.6 Test self-cycle and multi-tag cycle.
- [x] 4.7 Test failed-finalization atomicity.
- [x] 4.8 Test post-finalization mutation rejection.

## 5. Final gate
- [x] 5.1 Confirm 005 does not migrate current gameplay rules to tags.
- [x] 5.2 Reconcile implementation and specs.
- [x] 5.3 Run focused tag tests.
- [x] 5.4 Run typecheck, lint, full unit tests, build, and E2E.
- [x] 5.5 Inspect scope, update verification/state, and activate 006 only after VERIFIED.
