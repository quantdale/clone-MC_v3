# Proposal: 290-hero-of-the-village-reward

## Problem

The raid track (282–288) is playable through VICTORY and DEFEAT, and Change
278 ships a live trading-post UI with emerald prices. Winning a raid currently
grants **no** Hero of the Village reward: no status effect, no trading discount,
and no observable victory perk. Vanilla Minecraft rewards VICTORY with Hero of
the Village (level matching Bad Omen, ~40 minutes) which discounts villager
trade prices. Without that loop, raid victory is feedback-only.

## Goals

- On the exactly-once transition into raid `VICTORY`, grant the player Hero of
  the Village through the existing `StatusEffectManager` (`playerEffects`).
- Level and duration follow vanilla-like rules adapted to this game's 20 TPS /
  seconds-based effect runtime (documented in design).
- While the effect is active, trading-post emerald prices receive a
  vanilla-like level-scaled discount (never below 1 emerald), visible in the
  trading UI and applied at `applyTradeOffer`.
- DEFEAT grants nothing. Reloading or replaying after VICTORY MUST NOT grant
  twice from the same transition.
- Pause/dispose/reload safety; unit + browser E2E; 258 stays BLOCKED.

## Non-goals

- No villager entities, gift-throwing, patrols, outposts, or new raid mechanics.
- No HUD redesign (no dedicated new effect-list chrome beyond existing seams).
- No new persistence namespace unless required; status effects currently do not
  persist — document and keep ephemeral (minimal).
- No GPU/FPS work; Change 258 stays BLOCKED; no fake evidence.
- Do not author or implement Change 291 in this session.

## Preconditions

- Changes 282–289 are VERIFIED and published on `origin/main` (tip `0fb15f6`).
- `RaidStateMachine` reaches `VICTORY`/`DEFEAT`; `RaidState.badOmenLevel` is set.
- `StatusEffectManager` + `hero_of_the_village` type exist (014/121); Game owns
  `playerEffects`.
- Trading post (278) applies offers through `applyTradeOffer` / `VillagerTrading`.
- Change 258 remains BLOCKED; Changes 259–289 remain VERIFIED.

## Dependencies

- `src/simulation/RaidStateMachine.ts`, Game raid tick / `debugClearRaidWave`
- `src/data/StatusEffect.ts`, `StatusEffectManager.ts`
- `src/simulation/VillagerTrading.ts`, `src/ui/TradingPanel.ts`
- `src/engine/Game.ts` (`playerEffects`, trading, raid)

## Proposed change

1. Author this complete OpenSpec package under
   `openspec/changes/290-hero-of-the-village-reward/`.
2. Add CHANGE_SEQUENCE row + override ADDENDUM; make 290 the sole ACTIVE change.
3. Implement pure HOTV grant/discount helpers; wire exactly-once VICTORY grant;
   update `hero_of_the_village` registry bounds; discount emerald trade costs in
   compute + UI; toast on grant.
4. Unit + browser E2E evidence; full baseline gates; VERIFIED 100%; publish.

## Compatibility and migration

No new persistence/archive namespace. Existing saves remain valid. Behavioral
change: VICTORY grants an ephemeral HOTV effect that discounts emerald trade
prices until expiry/clear/death/dispose. Hydrating an already-`VICTORY` raid
MUST NOT re-grant. Registry bounds for `hero_of_the_village` widen
(maxAmplifier / duration) — additive for new grants only.

## Risks

- Double-grant on clear/tick/reload → grant only on observed non-VICTORY→VICTORY
  transition in-session; never on hydrate of terminal VICTORY.
- Discounting non-emerald sells incorrectly → only emerald-priced inputs.
- Floor below 1 emerald → `max(1, …)` on discounted emerald counts.
- Registry clamp rejecting intended level → raise `maxAmplifier` to 4 and
  duration to ≥2400s before grant.

## Rollback strategy

Revert the 290 commits together. No migration repair (nothing new persisted).
Raids return to feedback-only victory; trading prices return to catalog.

## Definition of Done

- Package passes SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; baseline gates green (document known
  SwiftShader visual drift honestly; enchanting:227 stays green).
- C290 exact; VERIFIED 100%; published to `origin/main`; 258 still BLOCKED.
- `nextExactAction` points at authoring a spec-first package for 291 (not
  started) with 3–5 candidate topics.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
