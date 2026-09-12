# Design: 266-live-adventure-spectator-integration

## Context/current state

- 194 `src/simulation/AdventureModeRules.ts`: pure `canBreakBlock(mode, blockId,
  allowed)` / `canPlaceBlock(mode, blockId, allowed)` (adventure ⇒ membership;
  spectator ⇒ false; else true) + `resolveBlockPermissionSet(directIds, tagIds,
  lookupTag)` (dedup union, unknown tags skipped, never throws). No live caller.
- 195 `src/simulation/SpectatorFramework.ts`: pure `noclip`, `hasGravity`,
  `hasCollision`, `canInteract`, `isAttackable`, `spectatorCameraAvailable`
  (each true/false only for spectator as documented). No live caller.
- 265 live wiring in `src/engine/Game.ts`: `gameMode: GameModeState` field,
  `__gamemode__:<worldId>` persistence with degrade-to-survival, `setGameMode` /
  `setGameModeFromText` / `toggleGameMode` (survival⇄creative only), chip label,
  `PlayerInteraction` closures (`depletesItems`, `instantBreak`, `dropsLoot`),
  `PlayerPhysics.isFlying` (`canFly`), flight drive
  (`resolveCreativeFlightVelocity`), survival-tick + `hurtPlayer` gates
  (`survivalStatsDeplete`), creative menu. `setGameModeFromText` already parses
  all four modes (192 `parseGameMode`); the chip click calls `toggleGameMode`.
- `PlayerInteraction.update` consumes break/place/use inputs and emits
  `break`/`place`/`use`/`blocked`/`empty` actions; `beginBreak`/`advanceBreak`
  own mining progress; `placeBlock` owns consume-then-commit.
- `PlayerPhysics.update` owns gravity/terminal/fall + substepped
  collision integration (`moveVertical`/`moveHorizontal`) + support query.
- `Game.tickHostileMobs` supplies `getPlayerTarget: () => PlayerTarget | null`
  (nullable — the gate point) and an `onPlayerDamaged` funneling into
  `hurtPlayer` (already spectator-safe). `Game.tickWithers` gates all player
  targeting on `playerAlive = survival.health > 0`; all wither damage funnels
  into `hurtPlayer`.
- `ItemStack { id, count, components?: StackComponentMap }`
  (`src/inventory/Inventory.ts`); `StackComponentValue` is flat
  (`number|string|boolean|Record<string, number|string|boolean>`);
  `SHARED_COMPONENT_REGISTRY = createDefaultStackComponentRegistry()` (3 types:
  damage, enchantments, potion-contents). `inventory.getSelectedStack()` /
  `setSelectedStack()` exist (259 precedent). `BlockSelector` exposes
  `getSelectedStack()`.
- Live block tags: `Game` builds `createDefaultBlockTags(blockRegistry)` for
  `HarvestRules` (transient local). `TagRegistry.membersOf` returns
  `ResourceId[]`, throws for unknown/non-finalized (adapter catches ⇒
  `undefined`, matching 194's skip-unknown contract).
- 265 E2E (`tests/e2e/creative-mode.spec.ts`) pins the chip click flipping
  survival⇄creative — the chip toggle MUST NOT change semantics.

## Target state

Adventure and spectator become fully live modes alongside survival/creative:

1. Adventure break/place consults the held stack: direct block ids +
   `#tag` references from `minecraft:can_destroy` / `minecraft:can_place_on`
   components, resolved through the live block-tag registry, composed with the
   194 rules. Empty/absent declarations ⇒ deny. Denial = `blocked` action
   before any consume or world edit.
2. Spectator: noclip flight (no collision, no gravity — gravity already off via
   `isFlying`), silent input drain (no break/place/use emission), no eating, no
   crafting/creative panel opens, no drop pickup, no hostile target supply, and
   wither targeting treats the player as not-alive. Free-look camera is the
   existing first-person camera (195 `spectatorCameraAvailable` satisfied;
   entity-possession polish explicitly deferred).
3. Mode select `<select id="gamemode-select">` in the HUD exposes all four modes
   through real DOM; chip toggle unchanged; toast/chip labels capitalized for
   all modes; `__gamemode__` covers all four modes with zero store changes.

## Invariants

- I-1: Survival/creative break/place outcomes are identical with and without
  this change (194 table: non-adventure/non-spectator ⇒ allow; closures default
  allow; survival/creative `canBreak`/`canPlace` always true).
- I-2: Spectator performs zero world edits and zero inventory mutations through
  the interaction, eat, pickup, and container paths.
- I-3: Denied adventure placements never consume the held stack (permission is
  checked before `consumeSelected`).
- I-4: `toggleGameMode()` semantics and the chip-click flip behavior are
  unchanged (265 E2E keeps passing unmodified).
- I-5: 194/195 modules are consumed read-only (no edits).

## API and data model

```ts
// src/inventory/StackDataComponents.ts (additive)
export const CAN_DESTROY_COMPONENT: ResourceId;      // minecraft:can_destroy
export const CAN_PLACE_ON_COMPONENT: ResourceId;     // minecraft:can_place_on
export type BlockPermissionComponentValue = Readonly<Record<string, boolean>>;
// validate: plain object, non-array, every key a non-empty string, every value === true.
export const canDestroyComponentType: StackComponentType;
export const canPlaceOnComponentType: StackComponentType;
// createDefaultStackComponentRegistry() gains the two types (3 → 5).

// src/simulation/AdventurePermissions.ts (new, pure, headless-safe)
export type BlockTagLookup = (tagId: string) => ReadonlySet<string> | undefined;
export function splitPermissionKeys(value: BlockPermissionComponentValue | undefined):
  { directIds: string[]; tagIds: string[] };          // '#' prefix ⇒ tag (prefix stripped)
export function getHeldPermissionSet(
  stack: { components?: StackComponentMap } | null | undefined,
  componentId: ResourceId,
  lookupTag: BlockTagLookup,
): ReadonlySet<string>;                               // absent/malformed ⇒ empty set, never throws
export function canBreakHeld(mode: GameMode, stack: ..., blockResourceId: string, lookupTag: ...): boolean;
export function canPlaceHeld(mode: GameMode, stack: ..., blockResourceId: string, lookupTag: ...): boolean;
// Both compose split + resolveBlockPermissionSet + 194 canBreakBlock/canPlaceBlock. Never throw.

// src/player/PlayerInteraction.ts (additive closures, defaults preserve legacy)
canBreak?: (blockId: number) => boolean;   // default () => true
canPlace?: (blockId: number) => boolean;   // default () => true
canInteract?: () => boolean;               // default () => true

// src/player/PlayerPhysics.ts (additive closure, default preserves legacy)
noclip?: () => boolean;                    // default () => false

// src/engine/Game.ts (wiring only + two public seams)
setHeldAdventurePermissions(canDestroy: readonly string[], canPlaceOn: readonly string[]): boolean;
// Attaches declaration components to the selected stack (false when no countable held stack).
getGameModeSelectValue? — no; the select syncs internally. Public surface used by E2E:
// setGameModeFromText('adventure' | 'spectator' | ...) (unchanged), getGameMode() (unchanged).
```

Key encoding detail: component keys are canonical block ids
(`minecraft:stone`) or tag references (`#minecraft:logs`). The `#` convention
is 266-local, documented here and in the spec; validators do not interpret it
(any non-empty string key is structurally legal; unknown tags resolve to
nothing at lookup time per 194).

## Control/data flow

Break (adventure): input edge ⇒ `beginBreak` ⇒ unbreakable check ⇒
`canBreak(numericId)` ⇒ Game closure maps numeric id → resource-id string via
`blockRegistry.getByLegacyId` (unknown ⇒ false) ⇒ `canBreakHeld(mode, heldStack,
rid, blockTagLookup)` ⇒ allow: legacy mining flow; deny: `blocked` action.
`advanceBreak` re-checks (target may change mid-mine); denial resets silently.

Place (adventure): `placeBlock` ⇒ selected/placeBlock checks ⇒ resolve numeric
target id via `registry.getByResourceId(selected.placeBlock)` (unknown ⇒
`blocked`) ⇒ `canPlace(targetId)` ⇒ deny: `blocked` before consume; allow:
legacy consume-then-commit.

Spectator: `update()` computes `canInteract()` once; false ⇒ hide outline,
drain `consumeBreak`/`consumeBreakClick`/`consumePlace`, reset break state,
return before any action emission. Eat (`tryEatSelected` early-return),
crafting/creative opens (toggle handlers refuse + toast), drop pickup (adder
refuses by returning `count`), hostile target supply (`() => null`), wither
`playerAlive &&= isAttackable(mode)` — all read the same 195 predicates.

Physics: `update()` samples medium (unchanged), applies gravity per `isFlying`
(unchanged), then `noclip()` ⇒ direct velocity integration, `fallDistance = 0`,
`onGround = false`, support = air, return.

Mode select: `#gamemode-select` change ⇒ `setGameMode(value)` (value validated
against the four options; unknown ⇒ no-op); `updateGameModeChip` syncs the
select to the live mode. Chip click still calls `toggleGameMode`.

## Detailed behavior

- Adventure with empty hand (null stack): empty set ⇒ deny break/place.
- Adventure denied break on press: single `blocked` toast per press (beginBreak
  path); held-denial mid-mine resets silently.
- Spectator right-click on furnace/brewing/enchanting: no `use` emission ⇒ no
  panel opens. Spectator `KeyE`/`KeyC` creative/crafting toggles: refuse + toast
  (`Spectators cannot use containers`); closing toggles still work (no-op safe).
- Spectator drop pickup: `collectPlayerDrops` adder returns `count` untouched;
  advancement obtain triggers do not fire (derived: `count - left == 0`).
- XP orbs keep ticking for spectator (physics/age advance; collection may grant
  XP). Rationale: collection is inseparable in `XpOrbManager.tickItemEntities`
  (264-verified; not reopened), XP is unspendable without container access, and
  freezing orbs would be a worse divergence. Documented, not asserted.
- Wither reward XP (`experience.addXp` on defeat) is unaffected (not player
  targeting).
- `setGameMode` toast: `Survival|Creative|Adventure|Spectator` (capitalized).
- Chip label: `Mode: Survival|Creative|Adventure|Spectator`.

## Failure modes

- Unknown numeric block id in `canBreak` closure ⇒ false (deny, never throw).
- Unknown `placeBlock` resource id ⇒ `blocked` (new fail-closed refusal; legacy
  paths always resolve since registries are canonical).
- Malformed component value on a live stack (hand-built map): validators reject
  at `.with()` time; `getHeldPermissionSet` treats missing/invalid reads as
  empty. Serialized saves with unknown component ids fail closed per the
  existing `Inventory.deserializeComponents` (null ⇒ whole snapshot rejected) —
  pre-existing behavior, unchanged; 266-created saves round-trip because the
  types are registered.
- `lookupBlockTag` never throws (parse failures, unknown tags, non-finalized ⇒
  `undefined`).

## Compatibility/migration

- Zero store changes; `__gamemode__` v1 payloads already carry any 192 mode.
- Saves authored by this build with declaration components load on older builds
  per the pre-existing unknown-component rejection (documented rollback note in
  proposal.md). No migration needed: absence of declarations is the specified
  adventure default (deny).
- Forward-created adventure/spectator `__gamemode__` records boot correctly on
  this build (mode applied + chip/select synced + rules live next tick).

## Performance/resource constraints

- Permission resolution runs per break/place attempt (edge-triggered), not per
  tick: one component read + tag union over small sets. No hot-path change:
  physics adds one closure call per update; interaction adds one per update plus
  per-attempt checks; hostile tick adds one predicate per tick.
- No new allocations in the per-frame path beyond the existing shapes.

## Testing seams

- Unit: pure `AdventurePermissions` over stub stacks + stub tag lookup (no Game);
  `PlayerInteraction` with stub closures + headless world stub; `PlayerPhysics`
  noclip through a solid-wall fixture; registry-size characterization.
- E2E (`window.__voxelGame` = live `Game`): `setGameModeFromText`,
  `setHeldAdventurePermissions`, inventory setup, read-only world observation;
  all break/place through real mouse input; mode select through real DOM
  `selectOption`; reload through `pagehide` + `reload` (265 precedent).

## Observability/debugging

- `getGameMode()` already exposes the live mode; denials reuse the `blocked`
  toast; chip + select both reflect the mode (aria-live on the chip).
- No new logging; no new metrics.

## Affected files/symbols

- NEW `src/simulation/AdventurePermissions.ts` (+ `tests/unit/AdventurePermissions.test.ts`).
- `src/inventory/StackDataComponents.ts`: +2 component types, registry +2.
- `src/player/PlayerInteraction.ts`: +3 closures, 4 gate points.
- `src/player/PlayerPhysics.ts`: +1 closure, 1 noclip branch.
- `src/engine/Game.ts`: blockTags field, `lookupBlockTag`, 3 interaction
  closures, physics `noclip`, hostile supplier gate, wither `playerAlive` gate,
  eat early-return, crafting/creative toggle gates, pickup adder gate,
  `setHeldAdventurePermissions`, toast/chip labels, `#gamemode-select` wiring.
- `index.html` (`#gamemode-select`), `src/styles.css` (select placement).
- `tests/unit/*`: new suites + `PotionItemData.test.ts` size 3→5 (+comment) +
  `GameModePersistence` adventure/spectator round-trip if uncovered.
- NEW `tests/e2e/adventure-spectator.spec.ts` (2 tests).
- `PARITY_MATRIX.md` C266 row; program state files.

## Rejected alternatives

- Numeric block-id sets in components: ids are not stable across registry
  evolution; canonical strings + tags match 194's contract.
- Array-valued components (`{ blocks: [...] }`): illegal in the 008 flat value
  model; record-of-`true` fits without a model change.
- Chip cycling all four modes: breaks the 265-pinned chip flip contract; a
  separate select preserves it.
- Gating spectator at `onInteractionAction`: too late (world edit already
  committed in `finishBreak`/`placeBlock`); gates live in `PlayerInteraction`
  before mutation.
- Touching `XpOrbManager`/`ItemEntityManager` internals: 264-verified; Game-side
  adder gating achieves the item half with zero reopen.

## Downstream dependencies

None: 266 is a leaf live-integration (no later change consumes its seams except
future UI polish, which is out of scope).
