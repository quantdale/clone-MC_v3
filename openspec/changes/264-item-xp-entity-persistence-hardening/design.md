# Design: 264-item-xp-entity-persistence-hardening

## Context/current state

- `ItemEntityManager.deserializeAll` (`src/simulation/ItemEntityManager.ts:319`):
  validates the 037 envelope + `minecraft:item` type + per-field finiteness,
  then `byId.set` / `order.push` per record. Duplicate ids silently collapse
  in the map while duplicating in the order list (one entity reads back
  twice); negative ids pass the inline check (only `createItemEntity` would
  throw, with a different message, and only after the batch is fully
  rebuilt — atomicity holds by luck, not by check); unknown `item` ids and
  `count > stackSize` pass (the manager holds `itemRegistry` but never
  consults it at hydrate).
- `XpOrbManager.deserializeAll` (`src/simulation/XpOrbManager.ts:225`):
  same shape; duplicate ids silently accepted. All other malformed classes
  already throw atomically.
- Live `Game` constructs both managers (`src/engine/Game.ts:915-916`) and
  ticks/collects them, but no save path references them: refresh loses all
  drops/orbs. The 037 `entities` store + `RepositorySaveSink` `'entities'`
  kind serve the generic `EntityManager` (129/131) chunk bridge, not these
  world-scoped managers.
- Precedent for world-scoped durable UI-adjacent state: wither list (252),
  gamerules (261), recipe book (262), advancements (263) — raw metadata
  records under `__<ns>__:<worldId>`, `open()` bulk-load with degrade + error,
  `save*` fire-and-forget with recorded errors, 257 reset delete, `WorldArchive`
  optional-field passthrough.

## Target state

- Both `deserializeAll` paths validate the whole batch (envelope via
  `validateSerializedEntity`, typeKey, per-record shape, cross-record id
  uniqueness, registry consistency for items) and throw a deterministic
  `Error` naming the fault before touching live state; on success they
  replace state wholesale and continue id minting at `maxId + 1` (empty batch
  → `nextId = 0`, preserving current behavior).
- `GamePersistence` persists both `serializeAll()` snapshots as raw records
  and bulk-loads them at `open()`; `Game` hydrates through the hardened
  readers with quarantine, and saves on autosave/dispose/pagehide.
- Risk-register R-4 reads CLOSED (both halves).

## Invariants

- I-1 (atomicity): a throwing `deserializeAll` leaves `byId`/`order`/`nextId`
  observably unchanged (size, reads, insertion order, minted ids).
- I-2 (uniqueness): after success, every live id is unique and non-negative;
  `nextId` exceeds every live id (no mint collision with hydrated ids).
- I-3 (round-trip): `deserializeAll(serializeAll())` into a fresh manager
  reproduces every entity field-for-field (id, item/value, xyz, vxyz,
  ageTicks) in order.
- I-4 (world scope): drops/orbs are owned solely by `Game`'s two managers;
  no `World` streaming/unload path references them, so chunk unload/reload
  cannot evict them (verified by the unload/reload cycle test + code
  inspection).
- I-5 (boot safety): corrupt/absent persisted payloads never throw out of
  boot; absent → empty managers, corrupt → empty managers + recorded error +
  save-health banner.

## API and data model

```ts
// ItemEntityManager.deserializeAll additions (all throw Error, manager unchanged):
// - `ItemEntityManager: duplicate item-entity id ${id} at index ${i}`
// - `ItemEntityManager: id must be a non-negative integer (got ...)`
// - `ItemEntityManager: unknown item id ${item} at index ${i}`
// - `ItemEntityManager: count ${count} exceeds stackSize ${max} for item ${item} at index ${i}`
// XpOrbManager.deserializeAll addition:
// - `XpOrbManager: duplicate xp-orb id ${id} at index ${i}`
```

```ts
// WorldMetadataRepository additions (261-263 precedent, zero new stores):
putItemEntityData(worldId: string, payload: unknown): Promise<void>;  // __itementities__:<worldId>
getItemEntityData(worldId: string): Promise<unknown | null>;
putXpOrbData(worldId: string, payload: unknown): Promise<void>;        // __xporbs__:<worldId>
getXpOrbData(worldId: string): Promise<unknown | null>;

// GamePersistence additions:
get initialItemEntities(): SerializedEntity[] | null;
get initialXpOrbs(): SerializedEntity[] | null;
saveItemEntities(payload: unknown): void;
saveXpOrbs(payload: unknown): void;

// Game additions:
saveItemAndXpEntities(): void;   // serialize both + save*; autosave/dispose/pagehide call it
getItemEntityCount(): number;    // e2e/test read surface (itemEntities.size passthrough)
getXpOrbCount(): number;         // e2e/test read surface (xpOrbs.size passthrough)
getPlayerPosition(): [number, number, number]; // e2e spawn placement
// `xpOrbs` field visibility private → public readonly (symmetric with the
// existing public `itemEntities` field; no getter wrapper).
```

Persisted payload shape: exactly `serializeAll()` output (`SerializedEntity[]`
with `minecraft:item` / `minecraft:xp_orb` typeKeys). No envelope version is
added: the 037 `schemaVersion: 1` per record is the version, and any future
shape change follows the 041 migration pattern.

## Control/data flow

1. Live tick: unchanged (spawn/tick/merge/collect/despawn in `Game.update`
   via `PlayerInteraction`).
2. Save: `Game.update` 5s cadence → `saveItemAndXpEntities()` →
   `persistence.saveItemEntities(itemEntities.serializeAll())` +
   `persistence.saveXpOrbs(xpOrbs.serializeAll())` (fire-and-forget raw puts,
   errors recorded). Same call in `dispose()` and `onPageHide`.
3. Load: `GamePersistence.open()` bulk-loads both raw records (absent →
   null; non-array or envelope-invalid → null + `load itementities` /
   `load xporbs` recorded error). `Game` hydrates: injected path immediately
   after manager construction; self-open path when the promise settles;
   each hydrate in try/catch → `deserializeAll` → quarantine (empty +
   `bootSaveDegraded` + banner) on throw.
4. Reset (257): both raw keys deleted in the multi-store transaction +
   snapshot/restore coverage. Archive: optional `itemEntityData` /
   `xpOrbData` (array-or-null) exported/imported.

## Detailed behavior

- Item hydrate validation order per record: envelope (037) → typeKey →
  id finite-integer + `>= 0` → duplicate-in-batch → `itemRegistry.has(item)`
  → count positive-integer + `<= stackSize(item)` → finite xyz/vxyz →
  ageTicks non-negative-integer. First fault throws with its index.
- XP hydrate validation order: envelope → typeKey → id finite-integer +
  `>= 0` → duplicate-in-batch → value positive-integer → finite xyz/vxyz →
  ageTicks non-negative-integer.
- Empty persisted array hydrates to empty managers with `nextId = 0`
  (matches `clear()` semantics).
- `saveItemAndXpEntities` is a no-op when persistence is absent or the world
  is recovery-required (257 parity with player-state gating); after a
  completed reset the facade is inert (existing `resetCompleted` guard on the
  new save methods, 261–263 parity).

## Failure modes

- Duplicate/malformed batch at hydrate → throw (manager unchanged); at boot
  → quarantine to empty + recorded error + banner; at facade open (non-array
  or envelope-invalid) → null + recorded error, boot continues empty.
- Storage write failure on save → recorded error + health monitor path
  (existing SAVE-FAIL machinery); live managers unaffected.
- Unknown item id at hydrate (registry drift) → whole batch quarantined,
  never partially loaded (a partial load would resurrect a subset and mint
  colliding ids later).

## Compatibility/migration

No store/version/migration changes. Old worlds (no keys) boot empty.
Archives without the optional fields import as null. Payloads written by this
change always re-validate (live state satisfies every rule by construction).

## Performance/resource constraints

- `deserializeAll` stays O(n) with one extra Set for dup tracking.
- Saves reuse the 5s cadence; payload is O(live drops + orbs), serialized
  synchronously (same cost class as the existing player-state snapshot).
- No per-tick persistence work; age mutation between saves is expected and
  harmless (last snapshot wins).

## Testing seams

- Managers: direct construction with `createDefaultItemRegistry()` (existing
  111/117 seams).
- Facade: `createIdbFactoryMock()` + real `GamePersistence` (263 precedent).
- Game hydrate quarantine: facade-level corrupt tests + E2E reload legs
  (Game is DOM-bound with no node harness, 263 precedent); the hydrate helper
  is structured so the try/catch-quarantine decision is unit-pinned at the
  facade + manager layers.
- E2E: `window.__voxelGame` for spawn/save/count observation; real reload
  for durability; `waitForFunction` polling for collection timing.

## Observability/debugging

- Error messages name manager + fault + batch index (`... at index ${i}`).
- Facade records `load itementities: ...` / `load xporbs: ...` /
  `save itementities: ...` / `save xporbs: ...` in the bounded error log;
  quarantine surfaces through the existing save-status banner.

## Affected files/symbols

- `src/simulation/ItemEntityManager.ts` (`deserializeAll`).
- `src/simulation/XpOrbManager.ts` (`deserializeAll`).
- `src/storage/WorldMetadataRepository.ts` (4 methods).
- `src/storage/GamePersistence.ts` (open bulk-load, getters, savers, reset,
  snapshot/restore types).
- `src/storage/WorldArchive.ts` + `WorldArchiver.ts` (optional fields +
  passthrough).
- `src/engine/Game.ts` (hydrate, `saveItemAndXpEntities`, accessors,
  autosave/dispose/pagehide call sites).
- Tests: `tests/unit/ItemEntityManager.test.ts`,
  `tests/unit/XpOrbManager.test.ts` (extended),
  `tests/unit/ItemXpPersistence.test.ts` (new),
  `tests/e2e/item-xp-persistence.spec.ts` (new: journey + removal).

## Rejected alternatives

- **Per-chunk `entities`-store wiring**: rejected — the two managers are
  world-scoped by verified design (111/117/131); chunk-grouping them would
  fork their serialization contracts and duplicate the 131 bridge for no
  player-visible gain. World-scoped raw records match the wither precedent.
- **Skip-with-quarantine inside the managers** (keep good records, drop bad):
  rejected — partial loads break id-mint continuity reasoning and hide data
  corruption; the codebase convention (111/117/131) is atomic throw, with
  quarantine one layer up (boot), where the operator-visible banner lives.
- **Dirty-queue `'entities'` kind for drops/orbs**: rejected — that kind is
  owned by the generic `EntityManager` chunk bridge (038/131/234); sharing
  the kind would couple two unrelated payload shapes to one routing key.

## Downstream dependencies

None: no later change consumes these namespaces. Future mob drops reuse the
same managers and inherit durability for free.
