# Tasks: 008-stack-data-components

> VERIFIED. All 20 tasks complete; full gate green.

## 1. Entry
- [x] 1.1 Confirm 007 VERIFIED and activate 008.
- [x] 1.2 Run and record the full baseline regression gate.

## 2. Component model
- [x] 2.1 Define the StackComponentValue primitive and the StackComponentType (id + validate + defaultValue).
- [x] 2.2 Define StackComponentRegistry on the 003 generic Registry core; reject duplicate ids; finalize.

## 3. Immutable component map
- [x] 3.1 Implement StackComponentMap (get/has/entries/with/without/equals/copy).
- [x] 3.2 Validate every value on construction and on with; reject unregistered ids (MISSING_ID) and invalid values (INVALID_ID).
- [x] 3.3 Freeze stored values; ensure with/without return new maps and leave the source untouched.
- [x] 3.4 Return entries in deterministic ResourceId order independent of insertion.

## 4. Tool damage component
- [x] 4.1 Define DAMAGE_COMPONENT id, DamageComponentValue, and damageComponentType validating a non-negative integer.
- [x] 4.2 Provide createDefaultStackComponentRegistry and emptyStackComponents helpers.

## 5. Compatibility
- [x] 5.1 Keep the Inventory durability array unchanged; current tools retain maxDurability metadata.

## 6. Tests
- [x] 6.1 Test component-type registration and duplicate rejection.
- [x] 6.2 Test damage-component validation (legal and illegal values).
- [x] 6.3 Test map construction, get/has, and with/without immutability.
- [x] 6.4 Test rejection of invalid values and unregistered component ids.
- [x] 6.5 Test map equality and deterministic iteration.
- [x] 6.6 Test frozen stored values and copy independence.
- [x] 6.7 Test additive compatibility (inventory metadata unchanged).

## 7. Final gate
- [x] 7.1 Reconcile 008 artifacts with implementation.
- [x] 7.2 Run focused component tests.
- [x] 7.3 Run typecheck.
- [x] 7.4 Run lint.
- [x] 7.5 Run full unit tests.
- [x] 7.6 Run build.
- [x] 7.7 Run E2E tests.
- [x] 7.8 Audit scope: no Inventory migration introduced in 008.
- [x] 7.9 Record exact completion and evidence.
- [x] 7.10 Update program state; activate 009 only after VERIFIED.
