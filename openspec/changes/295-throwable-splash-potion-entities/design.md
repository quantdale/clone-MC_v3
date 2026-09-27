# Design: 295-throwable-splash-potion-entities

## Context/current state

- `src/data/PotionItemData.ts` (122): `PotionContents { base?, kind,
  customEffects }`, `PotionEffectData { typeId: 'minecraft:effect/<key>',
  duration (seconds), amplifier }`, `POTION_CONTENTS_COMPONENT`,
  `POTION_SPLASH_RADIUS = 4`, `buildSplashPayload` (radius 0 for NORMAL).
  Potion item: `ItemId.Potion` (key `potion`, stack size 1).
- `src/simulation/ProjectileCore.ts` (142): `stepProjectile(world, resolver,
  state, targets, options)` — gravity then position integrate, entity hit
  (destination point inside target sphere, owner immune for
  `ownerImmunityTicks`), else swept block collision; drag on clear ticks.
- Status effects: `StatusEffectManager.add(ResourceId, seconds, amp)`
  (throws for unregistered ids); registry has speed, slowness, poison,
  weakness, … but **no** instant health/damage entries. `Game.playerEffects`
  is persisted (292).
- `RaiderCombatSystem` (288): RANGED raiders push `LiveProjectile`s; the
  witch uses `WITCH_RANGED_FALLBACK_DAMAGE = 5` (profile `baseDamage` and the
  projectile damage) — the documented stand-in this change retires.
- `PlayerInteraction.update` (queued right-click): container blocks → `use`,
  bone meal → `use`, else `placeBlock()`; right-click with no block target
  does nothing.
- `ParticleSystem` exists in `src/simulation/` but nothing in `src/` (Game,
  renderers) consumes it: there is no live particle render path.
- No gunpowder item (last ItemId `Smoker = 72`), no splash brewing recipe.

## Target state

Splash potions can be thrown by the player and by raid witches, fly as
ProjectileCore entities with gravity, shatter on block or entity contact and
apply their `potion_contents` to living targets in radius with vanilla
distance scaling; in-flight potions render as small bottles.

## Invariants

- I1. Every potion step goes through `stepProjectile` with gravity 0.05 and
  drag 0.99 (vanilla ThrownPotion).
- I2. A potion shatters exactly once (block hit, entity hit) or silently
  expires at 1200 ticks; shattered/expired potions leave the live set.
- I3. Intensity is 1 for the direct-hit target, else `1 − dist/4` for
  `distSq < 16` within the vertical band; never negative, never > 1.
- I4. Instant amounts: harming `floor(i·(6 << amp) + 0.5)`, healing
  `floor(i·(4 << amp) + 0.5)`; zero amounts do nothing.
- I5. Duration effects apply only when `floor(i·seconds·20 + 0.5) > 20`
  ticks, with duration = ticks / 20 s and the original amplifier;
  unregistered effect ids are skipped (never throw).
- I6. Throwing consumes exactly one potion iff `depletesItems(mode)`;
  creative never consumes; spectators never throw; a refused spawn (cap)
  never consumes.
- I7. Witch potion choice is a pure function of (horizontal distance, target
  health, target effects, roll) and the roll is a pure function of
  (entity id, sim tick).
- I8. No `WITCH_RANGED_FALLBACK_DAMAGE` / fixed witch damage remains.
- I9. Witch-thrown potions neither collide with nor affect raiders.
- I10. The renderer only adds/removes its own groups; resources allocated
  once in the constructor; 258 stays BLOCKED.

## API and data model

```ts
// src/simulation/SplashPotion.ts
export const SPLASH_POTION_GRAVITY = 0.05;
export const SPLASH_POTION_DRAG = 0.99;
export const SPLASH_POTION_MAX_AGE_TICKS = 1200;
export const SPLASH_POTION_HITBOX = 0.25;
export const SPLASH_POTION_CAP = 64;
export const PLAYER_POTION_THROW_SPEED = 0.5;
export const PLAYER_POTION_PITCH_OFFSET = (20 * Math.PI) / 180;
export const POTION_SPAWN_EYE_DROP = 0.1;
export const WITCH_POTION_THROW_SPEED = 0.75;
export const WITCH_EYE_HEIGHT = 1.62;
export const PLAYER_POTION_EYE_HEIGHT = 1.62;
export const SPLASH_POTION_HIT_MARGIN = 0.3;   // vanilla projectile pick margin
export const SPLASH_VERTICAL_REACH = 2;
export const INSTANT_DAMAGE_BASE = 6;
export const INSTANT_HEALTH_BASE = 4;
export const MIN_SPLASH_DURATION_TICKS = 20;

export type PotionThrower = 'player' | 'witch';
export type WitchPotionChoice = 'harming' | 'poison' | 'slowness' | 'weakness';
export type SplashTargetKind = 'player' | 'raid' | 'patrol';

export interface SplashTarget { kind; entityId; x; y; z; height; }  // feet pos
export interface LiveSplashPotion { id; state: ProjectileState; contents; thrower;
  owner: { kind: SplashTargetKind; entityId: number } | null; }
export interface SplashApplication { damage; heal;
  effects: { typeId: string; durationSeconds: number; amplifier: number }[] }
export interface SplashAffected { target: SplashTarget; intensity; direct; application }
export interface SplashShatter { potionId; thrower; x; y; z; cause: 'block'|'entity';
  directHit: SplashTarget | null; effects; affected: SplashAffected[] }

playerPotionThrowVelocity(yaw, pitch): {vx,vy,vz}
witchPotionThrowVelocity(from, target): {vx,vy,vz}
isInstantDamageEffect(typeId) / isInstantHealthEffect(typeId)
splashIntensity(impact, target, direct): number   // 0 = not affected
resolveSplashApplication(effects, intensity): SplashApplication
chooseWitchPotion({ horizontalDistance, targetHealth, hasEffect, roll }): WitchPotionChoice
witchPotionRoll(entityId, simTick): number in [0,1)
witchPotionContents(choice): PotionContents   // kind SPLASH
isThrowableSplash(contents): boolean          // kind === 'SPLASH'
splashThrowDecision({ canInteract, deathScreenOpen, depletesItems, stackCount,
  isPotionItem, contents }): { throw: true; consume } | { throw: false; reason }
class SplashPotionSystem {
  spawn(p: Omit<LiveSplashPotion,'id'>): LiveSplashPotion | null   // null past cap
  tick(world, resolver, targets): SplashShatter[]
  getPotions(); count; clear();
}
```

Instant effect ids (not in the effect registry; handled here only):
`minecraft:effect/instant_damage` and alias `minecraft:effect/harming`;
`minecraft:effect/instant_health` and alias `minecraft:effect/healing`
(the 123 brewing starter table emits `healing`).

Witch contents (vanilla Potions, splash keeps full duration):
harming = `instant_damage` amp 0; poison 45 s amp 0; slowness 90 s amp 0;
weakness 90 s amp 0.

`RaiderCombatTickInput` gains optional
`throwWitchPotion?: (t: WitchPotionThrow) => boolean` and
`getPlayerPotionStatus?: () => { health: number; hasEffect(key: string): boolean }`;
`WitchPotionThrow { ownerId, x, y, z, vx, vy, vz, choice, contents }`.
`RaiderCombatTickResult` gains `potionsThrown`.

`PlayerInteraction` gains option `onUseItem?: () => boolean`.

`src/rendering/SplashPotionRenderer.ts`: `SplashPotionRenderEntry { key, x,
y, z, tint }`, `splashPotionTint(contents)`, `SPLASH_POTION_TINTS`,
`SplashPotionRenderer { sync, setVisible, isVisible, size, getMeshes,
resourceCounts, dispose }`.

## Control/data flow

1. Right-click → `PlayerInteraction` (no target, or a non-container /
   non-bone-meal target) → `onUseItem()` → `Game.tryThrowSelectedSplashPotion()`
   → validate (canInteract, no death screen, selected Potion with SPLASH
   contents) → `splashPotions.spawn(...)` → consume iff `depletesItems`.
   When the hook returns false the old path (`placeBlock`) runs unchanged.
2. Fixed tick 5.7 `tickRaidFeedback` → `tickRaiderCombat` → witch RANGED
   branch → `chooseWitchPotion` + `witchPotionThrowVelocity` →
   `throwWitchPotion` sink → `splashPotions.spawn` (owner = raid witch).
3. Fixed tick 5.10 `tickSplashPotions()` (after patrols) → build candidates
   (player if alive and not spectator; ACTIVE raid raiders; ACTIVE patrol
   members) → `splashPotions.tick` → for each shatter apply: player →
   `hurtPlayer(damage, 'magic')` (no source coords: potions bypass the 279
   shield rule), `survival.heal(heal)`, `playerEffects.add` per effect; raid
   raider → `raiderCombat.damageRaider(id, damage, onRaidEntityRemoved)`;
   patrol → `pillagerPatrol.damageMember(id, damage, onPatrolCaptainKilled)`.
4. `render()` → `splashPotionRenderer.sync(entries)` before
   `renderer.render()` (same slot as the raider renderer).

## Detailed behavior

### Throw vectors

Player (vanilla `shootFromRotation(player, xRot, yRot, −20, 0.5, 1)` with
this repo's convention: pitch up positive, yaw −Z forward):
`d = (−sin(yaw)·cos(p), sin(p + 20°), −cos(yaw)·cos(p))`, normalized, × 0.5.
The −20° offset lifts only the vertical component, exactly like vanilla.
Spawn at `(x, y + 1.62 − 0.1, z)`. Looking straight down gives a straight
down throw that shatters at the thrower's feet (self splash, vanilla).

Witch (vanilla `Witch.performRangedAttack`): `dx = tx − wx`, `dz = tz − wz`,
`d3 = hypot(dx, dz)`, `dy = (ty + 1.62) − 1.1 − wy`; direction
`(dx, dy + 0.2·d3, dz)` normalized × 0.75; spawn at `(wx, wy + 1.62 − 0.1, wz)`.
Inaccuracy (vanilla 8.0 / 1.0 gaussian spread) and velocity lead are omitted
(deterministic divergence).

### Collision candidates

Each step builds an indexed candidate list; candidate `i` becomes a
ProjectileCore target with id `i`, centre at `y + height/2`, radius
`height/2 + 0.3` (player 1.8, raiders 1.95, ravager 2.2; the 0.3 is vanilla's
projectile pick margin). Vanilla aim geometry means very close witches
(≤ ~3 blocks) can lob over the target on flat ground (vanilla behaviour);
the splash radius still catches near misses. The owner's candidate
index is passed as `ownerId` (5-tick immunity). Witch-thrown potions only
see the player candidate (I9).

### Splash resolution

Impact point = the step's resolved position. For each candidate of the
thrower's scope: `direct` if it is the hit entity (intensity 1); otherwise
affected iff `|dx| ≤ 4`, `|dz| ≤ 4`, `impactY ∈ [y − 2, y + height + 2]` and
`dx² + dy² + dz² < 16` measured to the feet position; intensity
`1 − sqrt(distSq)/4`. The player is always in scope for any thrower
(the thrower splashing itself is vanilla).

### Application

`resolveSplashApplication(effects, i)`: sum instant harming amounts into
`damage`, instant healing amounts into `heal`; other effects produce
`{typeId, durationSeconds, amplifier}` when `ticks > 20`. Game applies to the
player: damage via `hurtPlayer` (creative/spectator exempt by 265), heal via
`survival.heal`, effects via `playerEffects.add` inside try/catch (unknown ids
skipped). Mobs: only `damage` (harming) is applied; `heal` and duration
effects are ignored for mobs (no per-mob effect managers).

### Witch choice

```
choice = harming
if d3 >= 8 && !has('slowness')             → slowness
else if health >= 8 && !has('poison')       → poison
else if d3 <= 3 && !has('weakness') && roll < 0.25 → weakness
```
`roll = hash32(entityId, simTick) / 2^32` (xorshift-multiply mix).
Cooldown stays `WITCH_RANGED_COOLDOWN_TICKS = 60`; the witch attacks only if
a sink is present and accepts the throw (cooldown starts on acceptance).
Without a sink (e.g. unit harnesses) the witch never attacks — there is no
fallback damage path.

### Consume rules

`tryThrowSelectedSplashPotion()` evaluates the pure `splashThrowDecision`
and returns false (nothing consumed) when:
not `canInteract(mode)`, death screen open, no selected stack / count 0,
item is not `potion`, no `potion_contents`, kind ≠ SPLASH, or the system
cap refuses. On success: consume iff `depletesItems(mode)`
(survival/adventure), then `hotbar.render()`.

## Failure modes

- Non-finite yaw/pitch/positions → throw refused (`spawn` returns null for a
  non-finite state).
- Cap reached → refused, nothing consumed, witch cooldown not started.
- Unregistered effect id → skipped.
- Entity removed between steps → candidate list rebuilt every step.
- Raider killed by harming → `onRaidEntityRemoved` exactly-once (284).

## Compatibility/migration

No schema change. In-flight potions are transient (lost on reload, like
arrows). Existing SPLASH stacks in saves become throwable.

## Performance/resource constraints

O(potions × candidates) per tick with ≤ 64 potions and ≤ ~30 candidates.
Renderer: two shared geometries and a fixed material palette allocated once.

## Testing seams

- `testGrantSplashPotion(effectKey, durationSeconds?, amplifier?)` → hotbar
  slot index (selected) or −1.
- `debugThrowSplashPotion(yaw?, pitch?)` → boolean (real use path).
- `debugTickSplashPotions(n)` → live count (clamped 0..2000 steps).
- `getSplashPotionState()` → potions, recent shatters (bounded 16), recent
  witch throws (bounded 16), renderer meshes.
- `getPlayerEffect(key)` → `{ duration, amplifier } | null`.

## Observability/debugging

Shatter records include cause, impact point, affected targets with
intensity and application; witch throw records include choice.

## Affected files/symbols

- NEW `src/simulation/SplashPotion.ts`, `src/rendering/SplashPotionRenderer.ts`.
- `src/simulation/RaiderCombatBehavior.ts` (fallback removed; potion sink).
- `src/player/PlayerInteraction.ts` (`onUseItem`).
- `src/engine/Game.ts` (system, renderer, tick 5.10, throw, seams).
- Tests: NEW `tests/unit/SplashPotion.test.ts`,
  `tests/unit/SplashPotionRenderer.test.ts`,
  `tests/unit/LiveSplashPotion.test.ts`,
  `tests/e2e/splash-potion.spec.ts`; updated
  `tests/unit/RaiderCombatBehavior.test.ts`.
- Docs: 288 proposal/design/spec/tasks/verification annotations,
  `PARITY_MATRIX.md` C288 note.

## Rejected alternatives

- Registering instant_health/instant_damage in the effect registry: would
  make them duration effects in the persisted manager and change 087/219
  catalog tests; instant handling belongs to the splash resolver.
- Keeping the witch fallback as a secondary path: violates the scope (retire)
  and hides potion regressions.
- Emitting into `ParticleSystem`: no consumer renders it; emitting would be
  invisible dead work.
- Adding gunpowder + brewing: new item, textures, loot sources and recipe
  table growth — separate change.

## Downstream dependencies

296+ may add lingering clouds, drinkable potions, gunpowder/splash brewing,
poison/regeneration ticks, per-mob effects, witch self-healing.
(Poison/regeneration/wither ticks landed in 296.)
