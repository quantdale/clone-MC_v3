# Tasks: 002-resource-id-foundation

> Status: **ACTIVE — implementation not started by this spec-authoring pass.**

## 1. Baseline and characterization

- [ ] 1.1 Read the active program state and confirm 001 is VERIFIED and 002 is the only ACTIVE implementation change.
- [ ] 1.2 Run the pre-change baseline: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`; record exact results in `verification.md`.
- [ ] 1.3 Inspect current string/numeric identity usage in `BlockRegistry`, crafting, persistence, and tests; confirm this change remains additive and does not migrate those consumers.

## 2. ResourceId contract implementation

- [ ] 2.1 Create the dedicated `ResourceId` module in a neutral data/core namespace.
- [ ] 2.2 Implement shared namespace validation for non-empty lowercase `[a-z0-9_.-]+` values.
- [ ] 2.3 Implement shared path validation for non-empty lowercase `[a-z0-9/._-]+` values.
- [ ] 2.4 Implement strict qualified parsing of `namespace:path`.
- [ ] 2.5 Implement unqualified parsing only when an explicit valid default namespace is supplied.
- [ ] 2.6 Implement direct namespace/path creation through the same validation path.
- [ ] 2.7 Implement immutable returned values so callers cannot mutate namespace/path after creation.
- [ ] 2.8 Implement canonical `namespace:path` serialization.
- [ ] 2.9 Implement exact equality and locale-independent deterministic lexical comparison.
- [ ] 2.10 Implement a structured validation error category/reason that callers/tests can distinguish.
- [ ] 2.11 Implement non-throwing try-parse behavior that returns null for validation failures without swallowing unrelated programming faults.

## 3. Focused unit verification

- [ ] 3.1 Test representative valid qualified IDs and canonical serialization.
- [ ] 3.2 Test every allowed namespace character class including `.`, `_`, `-`, and digits.
- [ ] 3.3 Test every allowed path character class including `/` and nested paths.
- [ ] 3.4 Test explicit default namespace parsing and canonical qualified output.
- [ ] 3.5 Test equality and deterministic namespace-then-path ordering.
- [ ] 3.6 Test empty input, empty namespace, and empty path rejection.
- [ ] 3.7 Test multiple colons and colon-in-path rejection.
- [ ] 3.8 Test uppercase rejection in namespace, path, and default namespace.
- [ ] 3.9 Test spaces, tabs, newline characters, Unicode, and unsupported punctuation rejection.
- [ ] 3.10 Test try-parse returns null for all validation categories and does not mutate external/global state.
- [ ] 3.11 Test parse → stringify → parse round trips across a table of legal IDs.
- [ ] 3.12 Test direct-create and parse routes produce equivalent values for the same canonical ID.

## 4. Integration and scope guards

- [ ] 4.1 Verify no existing numeric `BlockId` values change.
- [ ] 4.2 Verify current block string keys/recipe IDs/save payloads are not migrated by this change.
- [ ] 4.3 Verify no new runtime dependency is added.
- [ ] 4.4 Verify strict TypeScript/noUnused rules pass with the new module and tests.

## 5. Final gate

- [ ] 5.1 Re-read `proposal.md`, `design.md`, and the capability spec; reconcile any intentional implementation divergence before claiming verification.
- [ ] 5.2 Run focused ResourceId tests independently and record their count/result.
- [ ] 5.3 Run `npm run typecheck` and record PASS.
- [ ] 5.4 Run `npm run lint` and record PASS.
- [ ] 5.5 Run `npm test` and record PASS with total tests.
- [ ] 5.6 Run `npm run build` and record PASS.
- [ ] 5.7 Run `npm run test:e2e` and record PASS with total browser tests.
- [ ] 5.8 Inspect Git diff for accidental later-change work or unrelated modifications.
- [ ] 5.9 Update `verification.md` requirement mapping, exact task percentage, failures/deviations, and advancement decision.
- [ ] 5.10 Update `openspec/PROGRAM_STATE.json` and human checkpoint. Activate 003 only if 002 is VERIFIED and advancement is allowed.
