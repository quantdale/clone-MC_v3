# Design: 289-enchantment-persistence-reload-integrity

## Context/current state

Change 288 tip `e1ecc81` on `origin/main`. Enchant apply
(`Game.applyEnchantingOffer`) mutates the selected stack in memory
(`setSelectedStack` with `ENCHANTMENTS_COMPONENT`) and spends XP/lapis, but
does **not** call `savePlayerStateDurable`. Player state reaches IndexedDB via:

1. Periodic Game autosave (~5 s) → `savePlayerState` (enqueue only).
2. `Game.onPageHide` → `savePlayerStateDurable` (enqueue + `void flush()`).
3. `AutosaveCoordinator` pagehide/visibility listener → independent `void flush()`.
4. `dispose` → durable save.

`DirtySaveQueue.drainReport` removes a unit from `pending` **before**
`await sink.write(unit)`. On write **failure**, a mid-flight newer
`markDirty` is preserved (existing unit test). On write **success**, a
concurrent second drain can write a newer snapshot first; the slower stale
write then **clobbers** IndexedDB. `pagehide` registers **two** flush
starters (Game + AutosaveCoordinator), so concurrent drains are routine.

`Inventory.snapshot`/`restore` already round-trip `slotComponents` (unit suite
`InventoryComponentPersistence`). The e2e waits only `waitForTimeout(300)`
after synthetic pagehide — enough to lose the race intermittently.

Symptom: after reload, pickaxe id/count may restore while `enchantments`
reads null when the durable record is a pre-apply (or construction-default)
snapshot that won the clobber, or when flush never completed before reload.

## Target state

1. **Drain single-flight** — `DirtySaveQueue` serializes `drain`/`drainReport`
   so two flush callers cannot interleave writes for the same queue.
2. **Epoch / supersession** — each `markDirty` bumps a per-key epoch; a drain
   that observes a superseded epoch **skips** writing the stale payload
   (newer is already pending or was written under the lock).
3. **Enchant apply durability** — successful `applyEnchantingOffer` calls
   `savePlayerStateDurable()` (enqueue + flush start), matching the
   death→`saveStatistics` urgency class.
4. **Component codec proof** — unit round-trips for every default stack
   component type used in production.
5. **E2E integrity** — enchanting journey awaits a real flush signal
   (`persistence.flush()` / `pendingCount === 0`) after pagehide, then
   asserts components survive reload; repeat-each proves the flake is gone.
6. If investigation shows **only** harness sleep (no product clobber), prove
   it with a concurrent-drain unit that stays green without product change —
   then fix the test to await flush only and record that finding. Current
   evidence points at the product race; implement the mutex/epoch fix.

## Invariants

- I1. After any sequence of `markDirty` + concurrent `drain` callers, the
  durable sink's last successful write for a key MUST equal the latest
  marked payload (or a later one), never an older superseded payload.
- I2. `Inventory.snapshot`/`restore` MUST preserve all registered default
  stack components present on hotbar and storage stacks.
- I3. Successful enchant apply MUST enqueue the post-apply player snapshot
  before returning to the UI.
- I4. No new persistence namespace / archive field / schema version bump
  unless a missing namespace is proven (not planned).
- I5. Change 258 stays BLOCKED; no GPU/FPS work.

## API and data model

```ts
// DirtySaveQueue — internal only
private drainTail: Promise<void> = Promise.resolve();
private epochs = new Map<string, number>();

markDirty(unit: SaveUnit): void {
  const epoch = (this.epochs.get(unit.key) ?? 0) + 1;
  this.epochs.set(unit.key, epoch);
  this.pending.set(unit.key, { unit, epoch });
}

async drainReport(sink, limit): Promise<{ written: number; committedKeys: string[] }> {
  // chain on drainTail (mutex); skip write when unit.epoch !== epochs.get(key)
}
```

No public API change to `GamePersistence.flush` signature.

## Control/data flow

```
apply enchant → setSelectedStack + spend → savePlayerStateDurable
                                              → markDirty(player-state)
                                              → void flush()

pagehide → Game.onPageHide → savePlayerStateDurable
        → AutosaveCoordinator.onFlush → flush()
              └─ both enter DirtySaveQueue.drainReport under one mutex
                 latest epoch wins; stale writes skipped
```

## Detailed behavior

### Concurrent drain

- Entering `drainReport` awaits the previous drain's completion promise, then
  installs the next tail promise (classic promise-chain mutex).
- For each batch unit: if `unit.epoch !== epochs.get(key)`, skip write
  (superseded before start). After successful write, if epoch advanced during
  the await, the newer unit remains in `pending` for a subsequent round /
  caller (flush while-loop handles it).

### Enchant apply

- Only on `result.ok && result.stack`: after inventory mutations + session
  rebuild, call `savePlayerStateDurable()`.

### E2E

- Replace bare `waitForTimeout(300)` with: dispatch pagehide, then
  `await page.evaluate(async () => { const g = ...; await g.persistence?.flush(); })`
  and assert `pendingCount === 0` (or committed>=0 with pending 0).

## Failure modes

| Failure | Behavior |
|---|---|
| IndexedDB write rejects | Existing re-queue; epoch preserves newer mid-flight mark |
| Concurrent pagehide flushes | Serialized; latest epoch durable |
| Restore malformed components | Existing fail-closed `restore` → false; unchanged |
| Persistence null | `savePlayerStateDurable` no-op (unchanged) |

## Compatibility/migration

Opaque `inventory` payload unchanged. Old saves without `slotComponents`
still restore via legacy durability path. No migrator.

## Performance/resource constraints

- Mutex adds no extra IndexedDB ops; may slightly lengthen overlapping flush
  awaiters (still bounded by FLUSH_MAX_ROUNDS).
- Epoch map grows with distinct keys (same cardinality as pending historically);
  entries may be left after drain (acceptable; optional prune on commit).

## Testing seams

- Unit: concurrent `Promise.all([drain, drain])` with mid-write `markDirty`
  — final sink payload is latest.
- Unit: all default components round-trip via `snapshot`/`restore`.
- E2E: enchanting journey; `--repeat-each=20` before/after rates.
- Focused DirtySaveQueue + InventoryComponentPersistence + enchanting e2e.

## Observability/debugging

No new HUD. Verification records before/after repeat-each counts in
`verification.md`.

## Affected files/symbols

- `src/storage/DirtySaveQueue.ts` — mutex + epoch
- `src/engine/Game.ts` — `applyEnchantingOffer` → `savePlayerStateDurable`
- `tests/unit/DirtySaveQueue.test.ts` — concurrent latest-wins
- `tests/unit/InventoryComponentPersistence.test.ts` — all components
- `tests/e2e/enchanting.spec.ts` — await flush signal
- OpenSpec control plane + PARITY_MATRIX C289

## Rejected alternatives

- Lengthen e2e sleep only — masks product clobber; rejected by scope.
- Redesign storage / new namespace — YAGNI.
- Remove AutosaveCoordinator pagehide listener — would fix double-flush but
  not tick∩flush races; mutex is strictly stronger.
- Synchronous localStorage for player state — architecture regression.

## Downstream dependencies

None required for 290. Safer player-state durability benefits all inventory
component consumers (adventure CanDestroy/CanPlaceOn, potions, damage).
