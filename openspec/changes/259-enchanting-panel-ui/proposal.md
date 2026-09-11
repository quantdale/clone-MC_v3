# Proposal: 259-enchanting-panel-ui

## Problem

Changes 118–120 built a verified headless enchanting seam
(`src/inventory/EnchantingTable.ts`: deterministic offer generation,
atomic XP/lapis apply, session identity guard hardened 2026-08-23) and
change 219 filled the enchantment catalog — but no shipped UI consumes it.
`Game.openEnchanting()` builds a session and exposes it only to headless
consumers; the player can never see offers, reselect them, or apply them
in-game. Certification debt **R-3** (risk register, 2026-08-23) records
exactly this: the session guard is proven by unit tests on the pure guard
plus type-checked wiring, with no browser test driving
open→reselect→apply end-to-end. R-3's revisit trigger is "when the
enchanting panel UI ships" — this change is that trigger.

## Goals

- Ship an in-game enchanting panel UI over the existing headless seam with
  zero changes to offer/apply semantics.
- Player loop: place/use an enchanting table opens the panel; the panel
  shows the held item, lapis-like payment count, player XP level, and the
  three generated offers; the player reselects offers and applies the
  selected one with XP/lapis costs; inventory/XP update and persist.
- Preserve session-guard behavior (open→reselect→apply) and close R-3 with
  **browser E2E** coverage of that exact journey.
- Close/walk-away/focus/dispose lifecycle as safe as the furnace panel
  (251), mirroring its patterns.
- Original assets only — no Mojang proprietary art or sounds.

## Non-goals

- Do not re-litigate, touch, or certify 258 headed FPS work. 258 stays
  BLOCKED; this change claims no headed performance evidence.
- Do not expand the enchantment catalog (118/219 registries are sufficient);
  a tiny gap addition is allowed only if it blocks the panel, with evidence.
- Do not start multiplayer (222+ untouched).
- No new persistence formats: XP/inventory already persist through the
  player snapshot; the panel only routes through existing save paths.
- No new audio: reuse the existing generic UI sound path if any, else silent.

## Preconditions

- `origin/main` at session start `3a39b59ebaaaf53bb4d3f8a409b955d94cda6137`
  (clean tree, verified before authoring).
- Owner authorization (2026-09-11, Michael via Minecraft Clone Dev):
  259 is the sole ACTIVE implementation change while 258 stays BLOCKED
  (recorded in `openspec/CHANGE_SEQUENCE_OVERRIDES.md`).
- Seam inventory (verified by reading source, not assumed):
  `createSession`, `EnchantingTableSession.apply`,
  `enchantingTargetMatches`, `Game.openEnchanting` (private),
  `Game.getEnchantingSession`, `Game.applyEnchantingOffer`,
  `PlayerInteraction` enchanting-table `use` hook,
  `ExperienceSystem.spendLevels/addXp/snapshot`,
  `Inventory.getItemCount/removeItem/setSelectedStack`,
  `FurnacePanel` lifecycle patterns, `tests/e2e/furnace.spec.ts` harness.

## Dependencies

- 118-enchantment-registry (VERIFIED) — offer content + conflict rules.
- 119-enchantment-application (VERIFIED) — `setStackEnchantments`.
- 120-enchanting-table (VERIFIED) — session/offer/apply/guard semantics.
- 219-enchantment-potion-content-expansion (VERIFIED) — catalog depth.
- 251-live-furnace-production-integration (VERIFIED) — panel lifecycle
  patterns (`FurnacePanel`, `openFurnace`/`closeFurnace`, walk-away,
  focus, dispose) to mirror.
- 257-void-world-startup-recovery (VERIFIED) — player-snapshot durability
  the applied result persists through.

## Proposed change

Add `src/ui/EnchantingPanel.ts` (pure DOM view/controller over the live
`Game` session, mirroring `FurnacePanel`): offer list with reselect,
item/XP/lapis status, apply button routing to
`Game.applyEnchantingOffer`, reason display, close button. Wire `Game`:
`openEnchanting` takes the table position, opens the panel (pointer-lock
release, overlay/hud hide), tracks `enchantingOpen`/`enchantingPos` with
walk-away/destroy/focus/dispose/death/crafting-toggle/relock lifecycle
identical in shape to the furnace session. Add the `#enchanting` DOM shell
in `index.html` plus `enchanting-*` styles. Cover with unit tests
(FakeElement shim pattern) and a browser E2E journey
(`tests/e2e/enchanting.spec.ts`): place→open→reselect→apply→reload
persists→close/walk-away. Update `PARITY_MATRIX.md` (R-3-adjacent note)
and the risk register (R-3 closed).

## Compatibility and migration

No stored-data changes: the enchanted stack persists as ordinary item
components through the existing inventory snapshot; XP persists through
the existing experience snapshot. No migration. Old saves load unchanged;
the panel is available on any placed enchanting table (block 32, item 31).

## Risks

- E2E flakiness (pointer lock / world readiness) — mitigated by reusing
  the proven `furnace.spec.ts` harness helpers verbatim in shape.
- Offer unaffordability in E2E (costs scale with level) — mitigated by
  granting XP via `addXp` and selecting an affordable offer by reading the
  live session for setup only; the apply itself goes through real clicks.
- Scope creep into catalog expansion — forbidden unless a panel-blocking
  gap is proven with a failing test first.

## Rollback strategy

Delete `EnchantingPanel.ts`, its HTML/CSS, the Game wiring hunks, and the
new tests; `openEnchanting` reverts to headless-only. No data migration to
undo (no format changed). Sessions opened mid-rollback simply never render.

## Definition of Done

- Panel opens on enchanting-table use, shows item + XP + lapis + 3 offers.
- Reselect changes the pending offer; apply spends XP/lapis atomically and
  writes the enchanted stack to the held slot; failures show reasons and
  spend nothing.
- Session guard preserved: selection move / stack identity change voids the
  session and closes the panel.
- Lifecycle safe: close button, C toggle, walk-away (>8 blocks), table
  destruction, focus loss, pointer relock, death/respawn, dispose — none
  lose items/XP or leave a ghost panel.
- Applied result survives pagehide+reload (player snapshot path).
- Unit + E2E green; R-3 closed in risk register; PARITY_MATRIX updated.
- Baseline gate green: typecheck, lint, unit, build, e2e.

## Advancement gate

100% tasks; all MUST/SHALL verified; required tests pass; no unresolved
data-loss/corruption/determinism/compatibility/security/regression
blocker. Floor 90% only with an explicit Advancement Exception proving
every incomplete task is non-blocking and covers no MUST/SHALL.
