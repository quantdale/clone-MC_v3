# Tasks: 290-hero-of-the-village-reward

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/290-hero-of-the-village-reward/` (proposal, design, tasks,
  verification, capability spec, OVERRIDE_DRAFT); pass SPEC_AUTHORING_PROTOCOL
  quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 290 is the sole ACTIVE change; 258 stays BLOCKED; 259–289 stay VERIFIED.

## B. Pure rules + registry

- [x] T3. Implement `HeroOfTheVillage` pure helpers (amplifier/duration mapping,
  emerald discount + floor, grant predicate, `applyHeroTradeDiscount`) and
  widen `hero_of_the_village` registry bounds (maxAmplifier 4, duration ≥2400s,
  AMPLIFIER_SCALES).
- [x] T4. Unit tests: level/duration mapping; discount formula and floor;
  grant-once predicate; DEFEAT/false transitions; identity when no amp.

## C. Game wiring

- [x] T5. On observed non-VICTORY→VICTORY transition, grant HOTV via
  `playerEffects.add` with mapped amp/duration; toast; DEFEAT grants nothing;
  hydrate/already-VICTORY does not grant.
- [x] T6. Trading: project discounted emerald offers into TradingPanel display
  and `applyTradeOffer` debit/affordability; expiry/remove restores catalog
  prices; pause/dispose/reload safety (no double grant).
- [x] T7. Document ephemeral effects (no new namespace); keep death/clear
  behavior consistent with existing `playerEffects` lifecycle.

## D. Browser E2E

- [x] T8. Add `tests/e2e/hero-of-the-village.spec.ts`: win raid via existing
  debug seams → effect present → trading shows discounted emerald price →
  clear/expiry restores price; reload after VICTORY does not double-grant.

## E. Gates and release

- [x] T9. Focused unit + e2e green; record commands in verification.md.
- [x] T1.. Full baseline: typecheck, lint, `npm test`, build, `npm run test:e2e`,
  file-audit, validate-state; document visual SwiftShader variance honestly;
  kill hung Playwright after ~20 min no progress; enchanting:227 must stay green.
- [x] T1.. Reconcile artifacts; mark tasks [x]; VERIFIED 100%; set C290 exact;
  commit; land on main; `git push origin main` (no force); confirm local =
  origin; set nextExactAction to author 291 package (do not author/implement
  291) with 3–5 candidate topics.
