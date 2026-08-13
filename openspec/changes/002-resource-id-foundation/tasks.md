# Tasks: 002-resource-id-foundation

> Status: **BLOCKED — ResourceId implementation is complete, but the required E2E regression gate still has the same two pre-existing break/place failures present at the session-start baseline.**

## 1. Baseline and characterization

- [x] 1.1 Read the active program state and confirm 001 is VERIFIED and 002 is the only ACTIVE implementation change.
- [x] 1.2 Run the pre-change baseline: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`; record exact results in `verification.md`.
- [x] 1.3 Inspect current string/numeric identity usage in `BlockRegistry`, crafting, persistence, and tests; confirm this change remains additive and does not migrate those consumers.

## 2. ResourceId contract implementation

- [x] 2.1 Create the dedicated `ResourceId` module in a neutral data/core namespace.
- [x] 2.2 Implement shared namespace validation for non-empty lowercase `[a-z0-9_.-]+` values.
- [x] 2.3 Implement shared path validation for non-empty lowercase `[a-z0-9/._-]+` values.
- [x] 2.4 Implement strict qualified parsing of `namespace:path`.
- [x] 2.5 Implement unqualified parsing only when an explicit valid default namespace is supplied.
- [x] 2.6 Implement direct namespace/path creation through the same validation path.
- [x] 2.7 Implement immutable returned values so callers cannot mutate namespace/path after creation.
- [x] 2.8 Implement canonical `namespace:path` serialization.
- [x] 2.9 Implement exact equality and locale-independent deterministic lexical comparison.
- [x] 2.10 Implement a structured validation error category/reason that callers/tests can distinguish.
- [x] 2.11 Implement non-throwing try-parse behavior that returns null for validation failures without swallowing unrelated programming faults.

## 3. Focused unit verification

- [x] 3.1 Test representative valid qualified IDs and canonical serialization.
- [x] 3.2 Test every allowed namespace character class including `.`, `_`, `-`, and digits.
- [x] 3.3 Test every allowed path character class including `/` and nested paths.
- [x] 3.4 Test explicit default namespace parsing and canonical qualified output.
- [x] 3.5 Test equality and deterministic namespace-then-path ordering.
- [x] 3.6 Test empty input, empty namespace, and empty path rejection.
- [x] 3.7 Test multiple colons and colon-in-path rejection.
- [x] 3.8 Test uppercase rejection in namespace, path, and default namespace.
- [x] 3.9 Test spaces, tabs, newline characters, Unicode, and unsupported punctuation rejection.
- [x] 3.10 Test try-parse returns null for all validation categories and does not mutate external/global state.
- [x] 3.11 Test parse → stringify → parse round trips across a table of legal IDs.
- [x] 3.12 Test direct-create and parse routes produce equivalent values for the same canonical ID.

## 4. Integration and scope guards

- [x] 4.1 Verify no existing numeric `BlockId` values change.
- [x] 4.2 Verify current block string keys/recipe IDs/save payloads are not migrated by this change.
- [x] 4.3 Verify no new runtime dependency is added.
- [x] 4.4 Verify strict TypeScript/noUnused rules pass with the new module and tests.

## 5. Final gate

- [x] 5.1 Re-read `proposal.md`, `design.md`, and the capability spec; reconcile any intentional implementation divergence before claiming verification.
- [ ] 5.2 Run focused ResourceId tests independently and record their count/result.
- [x] 5.3 Run `npm run typecheck` and record PASS.
- [x] 5.4 Run `npm run lint` and record PASS.
- [x] 5.5 Run `npm test` and record PASS with total tests.
- [x] 5.6 Run `npm run build` and record PASS.
- [ ] 5.7 Run `npm run test:e2e` and record PASS with total browser tests.
- [x] 5.8 Inspect Git diff for accidental later-change work or unrelated modifications.
- [x] 5.9 Update `verification.md` requirement mapping, exact task percentage, failures/deviations, and advancement decision.
- [x] 5.10 Update `openspec/PROGRAM_STATE.json` and human checkpoint. Activate 003 only if 002 is VERIFIED and advancement is allowed.

## Completion

- Completed: **38 / 40**
- Percentage: **95%**
- Advancement: **FORBIDDEN** because required E2E does not pass, regardless of percentage.
- Change 003 remains inactive.
