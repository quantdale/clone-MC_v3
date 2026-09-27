# Proposal: 295-throwable-splash-potion-entities

## Problem

Splash potions exist only as data. Change 122 added the `potion_contents`
stack component with `PotionKind = NORMAL | SPLASH | LINGERING` and
`buildSplashPayload` (radius 4), explicitly leaving "a later throwable-entity
change" downstream. Nothing can throw a potion, nothing shatters one, and no
splash effect ever reaches a living entity. Because of that gap, 288 gave raid
witches a documented stand-in: a ProjectileCore dart that deals a fixed
`WITCH_RANGED_FALLBACK_DAMAGE = 5` on a direct player hit and applies no
effect at all. Vanilla witches throw real splash potions of harming, poison,
slowness and weakness chosen by the target's distance, health and effects.

## Goals

- Pure `src/simulation/SplashPotion.ts`:
  - vanilla throw vectors: player (`shootFromRotation` with the −20° pitch
    offset, speed 0.5, spawn at eye − 0.1) and witch (aim at target eye with
    `+0.2·horizontal` lift, speed 0.75, spawn at witch eye − 0.1);
  - a `SplashPotionSystem` stepping every live potion through 142
    `stepProjectile` (gravity 0.05, drag 0.99), shattering on block hit or
    entity hit, bounded by a live cap;
  - splash resolution: every candidate within the 4-block splash radius
    (`distSq < 16`, AABB inflated 4/2/4) gets intensity `1 − dist/4`, or 1.0
    for the directly hit entity;
  - effect application plan: instant harming → `floor(i·(6 << amp) + 0.5)`
    damage; instant healing → `floor(i·(4 << amp) + 0.5)` heal; duration
    effects → `floor(i·durationTicks + 0.5)` ticks, applied only above 20
    ticks (1 s);
  - vanilla witch potion choice (harming default; slowness at ≥ 8 blocks when
    not slowed; poison when target health ≥ 8 and not poisoned; weakness at
    ≤ 3 blocks when not weakened with a 25% roll) using a deterministic
    per-(entity, tick) roll.
- Player use action: right-click with a held SPLASH potion (air or a non-
  container block) throws it; survival/adventure consume one, creative does
  not; spectators cannot throw (266 rule).
- Raid witches throw real splash potions through the system; the 288
  fixed-damage fallback (`WITCH_RANGED_FALLBACK_DAMAGE`) is retired and the
  288 tests/docs/PARITY row that assert it are updated.
- Splash targets: the player (all registered duration effects + instant
  harming/healing) and raid-wave raiders / patrol pillagers for
  player-thrown instant harming (existing `damageRaider` / `damageMember`
  seams).
- Rendering: `src/rendering/SplashPotionRenderer.ts`, a small bottle box per
  in-flight potion following the 293 RaiderRenderer shared-resource pattern;
  no shared scene setup touched. The shatter particle is **skipped**: the
  `ParticleSystem` (kinds `block_debris`/`explosion`/`rain_splash`) has no
  live render path in `Game`, so there is nothing to emit into (documented).
- Item availability: splash potions are Potion items whose `potion_contents`
  kind is `SPLASH`. No gunpowder item exists, so no splash brewing recipe is
  added; availability is a test/debug seam (`testGrantSplashPotion`) plus
  any stored SPLASH stack (spec'd).
- Unit tests (trajectory, block/entity hit, radius falloff, instant vs
  duration, witch selection, consume rules, source guards) and browser E2E
  (player throw applies an effect to self; creative keeps the potion; a raid
  witch's potion applies its effect to the player).

## Non-goals

- No lingering potions / area-effect clouds; LINGERING stacks are not
  throwable by this change.
- No drinkable potions, no gunpowder item, no splash brewing recipe, no
  creative inventory menu.
- No per-mob status-effect managers: duration effects and healing do not
  apply to mobs; undead inversion is not modelled (no undead target in
  scope).
- No poison/regeneration damage ticks (poison is still a marker effect in the
  effect system; separate change).
- No witch self-drinking, witch healing of raiders, splash on zombies/pigs,
  thrower velocity inheritance or random inaccuracy.
- No persistence of in-flight potions (transient like 288 arrows).
- No particles, sounds or shared scene changes; Change 258 stays BLOCKED.

## Preconditions

- Changes 282–294 VERIFIED and published; `origin/main` = `b25dbc1`.
- Existing seams: `ProjectileCore.stepProjectile`, `PotionItemData`
  (`createPotionContents`, `POTION_CONTENTS_COMPONENT`,
  `POTION_SPLASH_RADIUS`), `StatusEffectManager.add`, `applyConsumeEffects`
  pattern, `hurtPlayer`, `survival.heal`, `RaiderCombatSystem.damageRaider`,
  `PillagerPatrolSystem.damageMember`, `depletesItems`, `canInteract`,
  `debugStartRaid`, `debugTickRaid`.

## Dependencies

- 122 PotionItemData, 142 ProjectileCore, 087/292 status effects, 265/266 game
  mode rules, 284/288 raid entities + combat, 291 patrols, 293 renderer
  pattern, `src/player/PlayerInteraction.ts`, `src/engine/Game.ts`.

## Proposed change

1. Author this package; CHANGE_SEQUENCE row + overrides addendum; 295 sole
   ACTIVE.
2. Pure `SplashPotion.ts` + unit tests.
3. RaiderCombatSystem witch potion sink; retire the fallback; update 288
   tests/docs.
4. Game wiring (use hook, fixed-tick stepping, splash application, seams) +
   PlayerInteraction item-use hook.
5. SplashPotionRenderer + tests.
6. Live composition tests, source guards, browser E2E.
7. Full gates; VERIFIED 100%; publish.

## Compatibility and migration

No stored-data change. Existing Potion stacks keep their `potion_contents`;
only SPLASH-kind stacks gain a use action. Raid saves are unaffected (combat
and projectiles were never persisted). Behaviour change: witches no longer do
a flat 5 damage; they apply potion effects (poison is a marker effect until
a poison-tick change lands, so witch damage now comes from harming only).

## Risks

- Player hit by own potion at launch → 142 owner immunity (5 ticks) plus the
  spawn at eye − 0.1; a potion thrown at the feet still splashes the thrower
  by radius (vanilla).
- Id collisions between raid and patrol managers → potions target a per-step
  indexed candidate list, never raw entity ids.
- Unbounded potions (creative spam) → live cap 64; spawns past the cap are
  refused and do not consume.
- Legacy 288 assertions → enumerated and updated (T6).

## Rollback strategy

Revert the 295 commits; no stored data depends on them.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; full baseline gates green (visual:176
  SwiftShader drift documented, goldens untouched; enchanting:227 green).
- C295 exact; C288 fallback note updated; VERIFIED 100%; published by
  fast-forward; 258 still BLOCKED.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
