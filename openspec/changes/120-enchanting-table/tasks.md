# Tasks: 120-enchanting-table

Status: VERIFIED
Completion: 100%

## 1. Register enchanting data

- [x] **1.1** In `src/inventory/ItemRegistry.ts`, add item ids `LapisLazuli = 28`,
      `Book = 29`, `Bookshelf = 30`, `EnchantingTable = 31` and `ItemTypeDefinition`
      entries (lapis/book: plain stack items; bookshelf + enchanting_table: place their
      respective blocks). Add optional `enchantability?: number` to
      `ItemTypeDefinition` and seed `enchantability` on `WoodenPickaxe` (15),
      `StonePickaxe` (5), `WoodenAxe` (15), and `Book` (1).
- [x] **1.2** In `src/world/BlockRegistry.ts`, add block ids `EnchantingTable = 32`,
      `Bookshelf = 33` (placed beyond the item-id range `1..31` to avoid colliding with
      the shared legacy numeric id space) and `BlockTypeDefinition` entries
      (`enchanting_table` drops the `enchanting_table` item; `bookshelf` drops the
      `bookshelf` item). No `lootTable` is set, so drops fall back to `dropItem`.
- [x] **1.3** Registry `finalize()` / `validateItemBlockCrossReferences` cross-checks
      still pass (items link to blocks via `placeBlock`; blocks link via `dropItem`).
- [x] **1.4** Unit test (`ItemRegistry.test.ts`, `BlockRegistry.test.ts`): new ids
      present; `enchantability` read back; `all()` length updated to 22; cross-refs valid.

## 2. XP spend primitive

- [x] **2.1** In `src/player/ExperienceSystem.ts`, add `spendLevels(n: number): void`
      that removes `min(n, level)` levels when available, re-derives `xp`/`xpToNext`
      via `computeXpToNext` while preserving the in-level progress fraction, and is a
      no-op on non-integer/negative/`n <= 0` input or when `n > level`.
- [x] **2.2** Unit test (`ExperienceSystem.test.ts`): `spendLevels` reduces `level`,
      preserves invariants, no-op on bad/insufficient; `snapshot`/`restore` still
      round-trip after a spend.

## 3. Enchanting-table core

- [x] **3.1** Create `src/inventory/EnchantingTable.ts` with pure
      `slotCost(slot, enchantability, playerLevel, rng)` (bounds 1..255),
      `generateEnchantments(itemDef, power, rng, registry)` (applicable,
      level∈[1,max], no conflicts; returns `[]` for non-enchantable items),
      `enchantCosts(level)` (xp==lapis==clamp 1..30), and
      `createSession({stack, itemDef, bookShelves, playerLevel, seed, registry})`
      returning `EnchantingTableSession` with 3 `offers` and `apply`. All randomness
      flows from a single `SeedRng` seeded by world seed + `'enchanting_table'` stream
      name + item/bookshelf/level inputs.
- [x] **3.2** `apply(offerIndex, ctx)` spends XP + reports lapis only when both
      available, then returns `{ ok:true, stack: setStackEnchantments(...), xpSpent,
      lapisSpent }`; otherwise `{ ok:false, reason }` (atomic — nothing spent on
      failure). Empty-enchantment offers are rejected with `reason:'empty'`.
- [x] **3.3** Unit test (`EnchantingTable.test.ts`): determinism (same inputs ⇒
      identical offers); `slotCost` bounds; `generateEnchantments` invariants
      (applicable, level∈[1,max], no conflict, valid resource id, deterministic);
      `enchantCosts` caps; non-enchantable ⇒ `[]`.
- [x] **3.4** Unit test `apply`: success spends xp+lapis and returns enchanted stack;
      failure on bad index / insufficient xp / insufficient lapis / empty (nothing
      spent); `setStackEnchantments` validates the resulting list (119 guarantee).

## 4. Interaction wiring (logic-level)

- [x] **4.1** Add a `use` action to `PlayerInteraction` (`InteractionAction` extended
      with `'use'`); right-clicking an `enchanting_table` target emits `'use'` instead
      of placing. Unit test (`PlayerInteraction.test.ts`): `'use'` fires on the table;
      non-table targets do not emit `'use'`.
- [x] **4.2** In `Game.ts`, on `use` of an `enchanting_table`, compute the clamped
      `bookShelves` (5×5×2 shell scan, capped 15), build `createSession` for the held
      item, and expose `getEnchantingSession()` + `applyEnchantingOffer(index)` (which
      writes the enchanted stack back to the selected slot and removes the spent lapis).
      The DOM panel is an explicit non-goal (deferred change) and consumes the session.
- [x] **4.3** Unit test (`PlayerInteraction.test.ts`): interacting with
      `enchanting_table` opens a session for the held item; non-table target is a
      no-op. (The `Game` apply path is covered by `EnchantingTable.test.ts` at the
      session level; `ItemInventory.setSelectedStack` backs the write-back.)

## 5. Full gate + verification + state advance

- [x] **5.1** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e`; all green (see `verification.md`).
- [x] **5.2** Fill `verification.md` with real evidence; mark every task group done.
- [x] **5.3** Advance `openspec/PROGRAM_STATE.json` / `.md` to 120 VERIFIED; set
      `nextChange` to `121-status-effect-runtime`.
- [x] **5.4** Commit (impl + state bump) and push to `origin/main`; verify remote == local.
