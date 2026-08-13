# Tasks: 005-tag-registry

> PLANNED. Implementation starts only after 004 is VERIFIED.

## 1. Entry
- [ ] 1.1 Confirm 004 verification and activate 005.
- [ ] 1.2 Run and record baseline checks.

## 2. Model and resolution
- [ ] 2.1 Define a typed tag bound to one registry domain.
- [ ] 2.2 Support direct ResourceId members.
- [ ] 2.3 Support nested same-domain tag references.
- [ ] 2.4 Reject duplicate tag definitions.
- [ ] 2.5 Add explicit tag finalization.
- [ ] 2.6 Validate direct members exist.
- [ ] 2.7 Validate nested tags exist.
- [ ] 2.8 Resolve transitive membership.
- [ ] 2.9 Deduplicate repeated/transitive members.
- [ ] 2.10 Detect self-cycles.
- [ ] 2.11 Detect multi-tag cycles.
- [ ] 2.12 Ensure failed finalization exposes no partial resolved state.
- [ ] 2.13 Cache resolved membership for normal queries.
- [ ] 2.14 Freeze resolved tag data after successful finalization.

## 3. Query behavior
- [ ] 3.1 Implement tag lookup/existence.
- [ ] 3.2 Implement fast membership query.
- [ ] 3.3 Implement deterministic resolved-member iteration.
- [ ] 3.4 Keep registry domains type-separated.

## 4. Tests
- [ ] 4.1 Test direct membership.
- [ ] 4.2 Test nested membership across multiple levels.
- [ ] 4.3 Test deduplication and deterministic order.
- [ ] 4.4 Test missing direct member.
- [ ] 4.5 Test missing nested tag.
- [ ] 4.6 Test self-cycle and multi-tag cycle.
- [ ] 4.7 Test failed-finalization atomicity.
- [ ] 4.8 Test post-finalization mutation rejection.

## 5. Final gate
- [ ] 5.1 Confirm 005 does not migrate current gameplay rules to tags.
- [ ] 5.2 Reconcile implementation and specs.
- [ ] 5.3 Run focused tag tests.
- [ ] 5.4 Run typecheck, lint, full unit tests, build, and E2E.
- [ ] 5.5 Inspect scope, update verification/state, and activate 006 only after VERIFIED.
