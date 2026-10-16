# Proposal: 112-item-pickup-and-despawn

## Problem

Change 111 made mined-block drops appear as world item entities, but those
entities are inert: they never move closer, can never be collected, merge
with nothing, and never disappear. The player therefore loses everything they
mine — a worse experience than the pre-111 direct-inventory behavior and a
parity gap. Real Minecraft item entities have a short pickup delay, merge with
nearby identical drops, fly/are pulled into the player's inventory, and despawn
after five minutes.

This change closes that gap: it adds pickup delay, a merge policy, inventory
insertion, and a despawn timer to the `ItemEntityManager` and wires them into
the per-tick simulation so drops become collectible.

## Goals

- Add a **pickup delay** so a freshly spawned drop cannot be collected for a
  short, deterministic interval (`PICKUP_DELAY_TICKS`).
- Add a **merge policy** that combines overlapping same-item entities up to the
  item's `stackSize`, reducing entity count and matching Minecraft drop behavior.
- Add **inventory insertion**: when the player is within pickup range and the
  delay has elapsed, the drop's stack is inserted into the player inventory via
  `Inventory.addItem`; the entity is removed (or its count reduced on a partial
  insert) accordingly.
- Add a **despawn timer** that removes entities older than `DESPAWN_AGE_TICKS`.
- Wire the three behaviors into `Game.update`'s simulation step (after age
  ticking) so they run automatically and deterministically.

## Non-goals

- **Movement / gravity / collision** — still 130. Item entities remain
  positionally static between spawn and pickup; only the *player's* position is
  used for pickup proximity. Merge/pickup use spawn positions, not physics.
- **Magnet / attraction motion** — no entity motion toward the player; pickup is
  proximity-based once the delay elapses.
- **XP orbs** — 117. This change is item-stack only.
- **Live autosave of the despawn/pickup state** — 131 persists the manager's
  serialized entities; the new transient state (age, pending pickup) serializes
  through the existing 037 envelope unchanged.
- **Mob death drops** — 148. The spawn API is reused; this change only consumes
  the drops that already exist.

## Preconditions

- 111 VERIFIED; `ItemEntityManager` exists with `tickItemEntities`,
  `spawnLootStacks`, `getItemEntities()`, `removeItemEntity`, and 037
  serialize/deserialize.
- `ItemEntity.count` is currently `readonly`; 112 makes it mutable so merge and
  partial pickup can adjust it (the `1 <= count <= stackSize` invariant is
  preserved by the manager).
- `Inventory.addItem(id, amount): number` inserts into compatible stacks / empty
  slots and returns the count it could not place (leftover).

## Dependencies

- 111 item entity model + manager (spawn, age, serialization).
- 009 inventory stack model (`Inventory.addItem`, `stackSize` caps).
- 037 entity persistence envelope (unchanged data shape).

## Proposed change

1. `src/world/ItemEntity.ts` (EDIT): change `count` from `readonly` to mutable
   (`count: number`) so merge and partial pickup can update it; document the
   manager as the sole mutator of quantity.
2. `src/simulation/ItemEntityManager.ts` (EDIT): add constants
   `PICKUP_DELAY_TICKS`, `DESPAWN_AGE_TICKS`, `MERGE_RADIUS`, `PICKUP_RADIUS`
   and three methods:
   - `mergeEntities(radius = MERGE_RADIUS): number` — fold overlapping same-item
     entities into one up to `stackSize`.
   - `despawnExpired(maxAgeTicks = DESPAWN_AGE_TICKS): number` — remove entities
     with `ageTicks >= maxAgeTicks`.
   - `collectPlayerDrops(playerX, playerY, playerZ, insert, pickupRadius = PICKUP_RADIUS): number`
     — for each entity past the pickup delay and within `pickupRadius`, call
     `insert(item, count)`, remove it on a full insert, or reduce its `count` on a
     partial insert; return the total collected count.
3. `src/engine/Game.ts` (EDIT): in the simulation block, after
   `tickItemEntities(dt)`, call `mergeEntities()`, `despawnExpired()`, and
   `collectPlayerDrops(player.position…, (id, n) => this.inventory.addItem(id, n))`;
   re-render the hotbar when anything was collected.

## Compatibility and migration

No stored-data shape changes. Serialized entities still use the 037 envelope;
`ageTicks` and `count` already round-trip, so 131 can persist the post-112
state without a migration. No registry id churn.

## Risks

- **Collectability regresses the 111 e2e**: the 111 test asserts a world item
  entity exists right after a break. Because pickup requires `ageTicks >=
  PICKUP_DELAY_TICKS` (0.5s), the assertion window (immediately after the block
  becomes air) still observes the live entity, so it stays green; a separate new
  test asserts the eventual pickup.
- **Merge could visually undo 111 splits**: spawn jitter (±0.25) keeps most
  split drops beyond `MERGE_RADIUS` (0.25), so only genuinely overlapping drops
  merge. 111's split unit tests never call `mergeEntities`, so they remain green.
- **Pickup radius vs. player geometry**: `PICKUP_RADIUS` (1.5) is chosen to
  cover a directly-below block (player center to block center ≈ 1.4) without
  being unreasonably large.

## Rollback strategy

All 112 behavior is gated behind the three new manager methods, called only in
`Game.update`. Removing those three calls (and optionally the `count` mutability)
restores the 111 inert-drop behavior. No persistent data depends on it yet.

## Definition of Done

- `mergeEntities`, `despawnExpired`, `collectPlayerDrops` implemented with strict,
  deterministic semantics and unit tests.
- Breaking a block and standing near it collects the drop into the inventory
  (verified by unit + e2e).
- Drops despawn after the timer; overlapping drops merge.
- Full gate green: typecheck, lint, unit tests, build, e2e.
- Artifacts updated; program state advanced.

## Advancement gate

Target 100%. No MUST/SHALL requirement may fail. Required tests: the new manager
pickup/merge/despawn suite, the updated break→collect e2e, and the unchanged
baseline (unit + e2e). Below 100% advancement is forbidden.
