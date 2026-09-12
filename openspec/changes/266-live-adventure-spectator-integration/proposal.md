# Proposal: 266-live-adventure-spectator-integration

## Problem

Changes 194 (`AdventureModeRules`) and 195 (`SpectatorFramework`) verified the
pure headless predicates for adventure and spectator modes, and change 265 wired
only the creative subset of the 192 `GameModeFramework` into the live Game.
As shipped, adventure and spectator modes persist (the shared `__gamemode__`
record already round-trips all four modes) and parse (the 192 text entry accepts
all four names), but they have **no live semantics**:

- adventure break/place is unrestricted (the 194 allow-lists are never consulted);
- spectator still collides, takes interaction input, opens containers, uses
  items, picks up drops, and is targeted by hostile mobs and the wither;
- the HUD mode switcher only exposes survival ⇄ creative, so adventure and
  spectator are reachable solely through the `setGameModeFromText` seam.

## Goals

1. Adventure: in adventure mode, breaking/placing a block succeeds only when the
   held stack's declared permission set (CanDestroy / CanPlaceOn) contains the
   block; no declared set ⇒ cannot break/place. Survival/creative behavior is
   unchanged; spectator never breaks/places (194 rules, applied live).
2. Spectator: noclip / no gravity / no collision movement, `canInteract=false`
   (no break/place/use, no item use, no container opens, no drop pickup), and
   `isAttackable=false` (no hostile targeting, no wither targeting, no damage)
   in every live path where a hook exists. Free-look flight already reaches
   spectator via 192 `canFly` + the 265 flight drive; this change adds the
   missing noclip/collision half.
3. Shared: mode switching exposes adventure + spectator (text seam already does;
   add a HUD mode select; the 265 chip toggle stays survival⇄creative
   byte-for-byte), `__gamemode__` persistence stays correct for all four modes
   (no store change), and unit + browser E2E prove the new semantics without
   regressing survival/creative.
4. Original assets only; no new simulation systems; no headed-GPU work.

## Non-goals

- Multiplayer behavior (222–237 arcs own the network boundary).
- Hardcore (193) except where the existing shared hooks already cover it.
- 258 headed FPS certification (stays BLOCKED; untouched).
- JE-style spectator entity-possession / cinematic camera polish: the spectator
  camera is free-look flight (195 `spectatorCameraAvailable` is satisfied by the
  existing first-person free camera + noclip flight). Any narrower camera
  deferral is documented in design.md, not built here.
- A chat UI for `/gamemode` (191 parity stays text-seam based).

## Preconditions

- 194, 195 VERIFIED (pure predicates, unchanged by this change).
- 259–265 VERIFIED (this change extends their seams without altering them).
- 258 BLOCKED (no headed work in this change).

## Dependencies

- `src/simulation/AdventureModeRules.ts` (194): `canBreakBlock`, `canPlaceBlock`,
  `resolveBlockPermissionSet` — consumed, not modified.
- `src/simulation/SpectatorFramework.ts` (195): `noclip`, `hasGravity`,
  `hasCollision`, `canInteract`, `isAttackable` — consumed, not modified.
- `src/simulation/GameModeFramework.ts` (192) + 265 live wiring (`__gamemode__`,
  `setGameMode`, `setGameModeFromText`, chip, `depletesItems`/`instantBlockBreak`/
  `dropsLoot`/`isFlying` closures) — extended, not altered.
- `src/inventory/StackDataComponents.ts` (008): extended with two new component
  types (additive; one mechanical registry-size characterization update).
- `src/data/TagRegistry.ts` (005) via the live block tags already built in
  `Game` for `HarvestRules` (114).

## Proposed change

1. **Declarations**: two new stack component types, `minecraft:can_destroy` and
   `minecraft:can_place_on`, whose values are flat `Record<string, boolean>`
   maps (fits the 008 value model): keys are canonical block ids
   (`minecraft:stone`) or `#`-prefixed block-tag references (`#minecraft:logs`),
   every value MUST be `true`. A new pure 266 helper
   (`src/simulation/AdventurePermissions.ts`) splits keys, resolves tags through
   an injected lookup backed by the live block-tag registry, and composes the
   194 rules over the held stack.
2. **Live adventure**: `PlayerInteraction` gains `canBreak`/`canPlace` closures
   (default allow = legacy); `Game` wires them to the held-stack composition.
   Denials surface the existing `blocked` action (no consume, no world edit).
3. **Live spectator**: `PlayerPhysics` gains a `noclip` closure (default false)
   that integrates velocity directly with no collision and no support;
   `PlayerInteraction` gains a `canInteract` closure that drains inputs silently
   when false; `Game` wires 195 predicates into physics, interaction, eat,
   crafting/creative panel opens, drop pickup, hostile target supply, and wither
   targeting aliveness. Direct damage is already gated by `hurtPlayer` +
   the survival-tick gate (verified, extended to spectator by 265's predicate
   use — no change needed).
4. **Switching UI**: keep the chip toggle; add a HUD `<select id="gamemode-select">`
   with all four modes synced to the live mode; capitalize Adventure/Spectator
   toast + chip labels.
5. **Tests**: new unit suites (permissions, interaction gates, noclip, registry
   characterization update, adventure/spectator `__gamemode__` round-trip if not
   already covered) + two new browser E2E specs reusing the 265 harness shape.

## Compatibility and migration

- No store/schema changes: `__gamemode__` already persists all four 192 modes;
  reset/archive passthrough unchanged. Worlds saved in adventure/spectator by
  this build load as the same mode; older builds degrade per 265 rules.
- New stack components serialize through the existing generic component path
  (`Inventory` serialize/deserialize); old saves without them behave as
  no-declaration (adventure cannot break/place — the specified default).
- `PlayerInteraction`/`PlayerPhysics` new closures default to legacy behavior;
  all existing constructions compile and behave identically.

## Risks

- Registry-size characterization (`PotionItemData.test.ts` pins 3 default
  types): mechanical update to 5 with a comment (precedent: 177/179).
- Toast/outline behavior on denial: denials reuse `blocked`; spectator drains
  silently to avoid toast spam while holding inputs.
- E2E flakiness under software WebGL: reuse the 265 harness (pointer lock,
  target acquisition, cooldown waits); no new harness machinery.

## Rollback strategy

Revert the 266 commit range; `__gamemode__` records and component-bearing stacks
are inert without this code (unknown components fail closed on load per the
existing `Inventory` validator, which is the documented pre-existing behavior
for forward-created saves — noted in design.md).

## Definition of Done

- All 13 tasks checked with evidence; every MUST/SHALL requirement maps to a
  passing test; baseline gates green
  (`typecheck`, `lint`, `test`, `build`, `test:e2e`); `PARITY_MATRIX.md` C266
  row `exact`; 258 still BLOCKED (not VERIFIED); 259–265 still VERIFIED.

## Advancement gate

Standard gate: 100% tasks (floor 90% only with an explicit non-blocking
exception), all MUST/SHALL verified, required tests green, no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
