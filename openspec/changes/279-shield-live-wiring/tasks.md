# Tasks: 279-shield-live-wiring

## A. Control plane and specification

- [x] T1. Add the sequential 279 row/override, activate `PROGRAM_STATE` from
  published 278 `05203ab`, keep 258 BLOCKED, and reserve 280.
- [x] T2. Complete the SPEC_AUTHORING_PROTOCOL package: one shield-wiring
  outcome, explicit source/direction/failure/migration/performance rules,
  MUST/SHALL scenarios, and a verification mapping with no 280 scope.

## B. Item, equipment, and input seams

- [x] T3. Add `ItemId.Shield=71` (`shield`, stack 1, max durability 336,
  procedural icon) and component-preserving Offhand wear/swap helpers; cover
  registry, break, component retention, and snapshot round-trip units.
- [x] T4. Add the `V` offhand-swap input and Game live raised-state adapter;
  use the right-button hold only when an Offhand shield is equipped, drain
  competing placement input, and cover stale/release/container/mode no-ops.

## C. Damage integration and presentation

- [x] T5. Pass real hostile/wither source positions into the existing shield
  resolver; apply blocked damage atomically, wear/break the shield, and apply
  axe-disable cooldown without altering source-less environmental damage.
- [x] T6. Add the low-frequency `#shield-indicator` HUD state/toast and public
  read-only/test seams; ensure autosave/pagehide/dispose reuse inventory state.

## D. Verification

- [x] T7. Add focused unit coverage for yaw conversion, front/edge/behind
  composition, blocked health/wear, break, cooldown, and interaction drain.
- [x] T8. Add `tests/e2e/shield.spec.ts`: real V swap + right hold, front block,
  behind damage, axe disable, break/HUD, and reload durability.
- [x] T9. Run 259–278 regression and review no unrelated behavior changed.
- [x] T10. Run `typecheck`, `lint`, full unit, build, full E2E, file-audit, and
  `validate-state`; record exact results and existing non-failing warnings.
- [x] T11. Reconcile all artifacts against implementation; add C279 exact row,
  promote state/verification to VERIFIED only at 12/12, and preserve 258 BLOCKED.
- [ ] T12. Commit and publish 279 to `origin/main`, verify the remote tip, and
  checkpoint the next exact action as 280 spec-first.
