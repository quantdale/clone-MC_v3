# Verification: 006-block-property-schema

Status: **PLANNED / NOT VERIFIED**

Advancement allowed: **false**

## Entry gate

006 implementation is forbidden until 005 is VERIFIED.

## Required evidence

- valid/invalid property-name tests;
- boolean property tests;
- integer-range boundary/configuration tests;
- named-value uniqueness/order tests;
- exact parse/serialize round trips;
- no-coercion invalid-input tests;
- schema determinism/immutability tests;
- current empty-schema block compatibility tests;
- typecheck, lint, full unit suite, build, and E2E.

## Task-ledger note

At spec authoring time the connector did not accept creation of this change's `tasks.md`. Before 006 can become ACTIVE, `openspec/SPEC_AUTHORING_PROTOCOL.md` therefore requires the agent to create/validate the missing detailed task ledger. This missing artifact itself blocks implementation and advancement; it is not treated as completed work.

## Advancement Exception

Not applicable. Expected completion is 100% after the task ledger is authored and executed.

## Final decision

**NOT ELIGIBLE TO IMPLEMENT OR ADVANCE** until 005 is verified and the complete 006 task artifact exists and passes the pre-implementation spec-quality gate.
