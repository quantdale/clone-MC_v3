# Tasks: 294-bad-omen-raid-escalation-and-death-parity

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/294-bad-omen-raid-escalation-and-death-parity/`
  (proposal, design, tasks, verification, capability spec, OVERRIDE_DRAFT);
  pass SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 294 is the sole ACTIVE change; 258 stays BLOCKED; 259–293 stay VERIFIED.

## B. Pure rules

- [ ] T3. Implement `src/simulation/RaidEscalation.ts`: `raidWavesForOmen`,
  `escalateRaid`, `isRaidInVillage`, `resolveVillageOmenAction`,
  `RAID_ESCALATION_RADIUS`.
- [ ] T4. Unit tests `tests/unit/RaidEscalation.test.ts`: wave table, level
  math, cap (consumed), never-shrinking waves, unchanged progress fields,
  terminal/invalid no-op, village radius, action precedence, HOTV amplifier
  after an escalated victory.

## C. Game wiring

- [ ] T5. `evaluateBadOmenVillageTrigger` ESCALATE_RAID branch: escalate in
  place, dismiss patrol, consume omen, bar refresh + toast, `saveRaid()` then
  `savePlayerStateDurable()`; fail closed when not applied.
- [ ] T6. `respawnPlayer` clears Bad Omen (level + remaining) before the
  durable save; comments updated.

## D. Legacy alignment and tests

- [ ] T7. Update tests/comments/docs asserting replace-on-omen or
  keep-omen-on-death (LiveBadOmen mirror, Game comments, 285/291/292 design
  annotations, C292 PARITY notes).
- [ ] T8. `tests/unit/LiveRaidEscalation.test.ts`: owner composition
  (escalation with patrol dismissal, persistence round trip of raid + player
  effects, death clear, escalated victory HOTV) + Game source guards.
- [ ] T9. `tests/e2e/bad-omen-raid-escalation.spec.ts`: escalation during an
  active raid (same wave entities, patrol dismissed, bar badge, reload keeps
  escalated raid and omen 0, escalated victory HOTV amp 2); cap escalation;
  death clears omen across reload.

## E. Gates and release

- [ ] T10. Focused + full baseline: typecheck, lint, `npm test`, build,
  `npm run test:e2e`, file-audit, validate-state; document visual:176
  SwiftShader variance honestly (no golden churn); enchanting:227 green.
- [ ] T11. Reconcile design/spec with implementation; file-audit rows; C294
  exact in PARITY_MATRIX.
- [ ] T12. VERIFIED 100%; fast-forward onto main; `git push origin HEAD:main`
  (no force); confirm local = origin; sync localHead/publishedHead;
  nextExactAction → author 295 package with candidate topics (not started).
