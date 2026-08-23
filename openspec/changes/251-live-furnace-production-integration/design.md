# Design: 251-live-furnace-production-integration

## Architecture

### Single source of truth

`FurnaceState` lives in exactly one place per placed furnace: the `data` payload of its
052 `BlockEntityInstance`, held by one runtime `BlockEntityManager` owned by the live
block-entity host (`src/engine/LiveBlockEntityHost.ts`). Every other representation is a
derived view valid only for the duration of its use:

- the 39-slot furnace menu (109 `createFurnaceMenu`) is derived per render/transaction from
  state + player inventory and written back through 106 transactions + `withFurnaceSlots`;
- persistence reads `manager.serializeChunk(cx, cz)` into a full-snapshot
  `block-entities` save unit (038 queue → RepositorySaveSink → 036 store);
- the DOM panel renders from the same state each frame it is visible.

There is no UI-owned copy, no World-owned copy, and no persistence-owned live copy.

### Composition (Phase A)

`Game` constructs the host after `World`. The host exposes:

- `placeFurnace(x, y, z)` — called when a furnace block placement commits;
- `removeFurnace(x, y, z): FurnaceState | null` — called when a furnace block breaks; returns
  the final state so the caller can drop contents, and removes the instance exactly once;
- `get(x, y, z)` / `has(x, y, z)`;
- `tickFurnaces(simTick)` — fixed-tick entry;
- `hydrate(records)` / `serializeChunk(cx, cz)` / `markChunkUnloaded(cx, cz)`.

Placement/break hooks are wired at the two authoritative mutation points in `Game`
(`onInteractionAction('place'|'break')` extended with target coordinates), not inside World,
because block identity transitions to/from furnace only occur via player interaction in this
game mode. Boot hydration applies persisted 036 records for this world before the first frame
(same bulk-load moment as `initialEdits`).

### Fixed-tick simulation (Phase B)

`runFixedTick` calls `host.tickFurnaces(tickIndex)` between item entities and random ticks.
The host iterates furnaces grouped by chunk and ticks only chunks where
`world.isChunkSimulating(cx, cz)` — byte-for-byte the same policy as mob/random-tick gating,
so pause (driver emits no ticks), loading, and non-simulating chunks all stop smelting with no
extra machinery. FPS cannot alter speed because the driver converts frame time into bounded
20 TPS ticks. Each tick advances state via the pure 109 `tickFurnace(state, ctx)`; the host
then swaps the new instance into the manager (a new `replace()` operation preserving insertion
order — instances are immutable by contract) and marks that chunk's save unit dirty. Resume
after unload/reload re-hydrates from the last committed snapshot; because fuel consumption and
output production happen inside one atomic pure tick, a reload can never double-consume or
double-produce beyond the committed boundary.

### Chunk activation/deactivation (Phase B)

The manager keeps every live furnace resident (mirroring the edit-overlay policy "kept so
edits survive reload"), but ticking requires the chunk to be in the simulating set, and an
unloaded chunk's unit is flushed eagerly on deactivation so a crash right after unload loses
nothing already simulated. On chunk removal there is exactly one instance per position, so
there is nothing to deduplicate on reload — hydration skips positions already resident.

### Player interaction (Phase C)

`PlayerInteraction.update` gains a furnace check before the bone-meal branch:
targeting `BlockId.Furnace` emits `onAction('use', id, coords)` and never falls through to
placement. `Game.onInteractionAction` routes furnace targets to `openFurnace(x,y,z)`.
Opening releases pointer lock and shows the panel (same pattern as crafting); Esc/pause,
walking-away rules, destruction of the open furnace, death/world transition, and focus loss
all route through `closeFurnace(returnCursor=true)`, which merges any cursor stack back into
the inventory (or drops it if the inventory is full — never deletes). While a panel is open
the resolved-input path already treats the game as paused (`craftingOpen || overlayOpen ||
furnaceOpen`), so input cannot leak into mining/placement.

### UI (Phase D)

New `src/ui/FurnacePanel.ts` follows CraftingPanel patterns (plain DOM + atlas icon cells).
Layout: input slot, fuel slot, output slot, flame bar (burn fraction), arrow bar (smelt
progress), 36 player slots, close button. Clicks map onto 203 screen semantics via the pure
`ContainerScreenFramework` reducer family: left click = pick/place/merge/swap, right click =
split-half/place-one, shift-click = quickMove between regions, hotbar cells included in the
player region. Output extraction is an ordinary transaction — atomicity comes from 106, which
is already proven lossless. Cursor rendering follows the cursor stack.

### Persistence (Phase E)

`GamePersistence` gains three thin members over its existing internals:

- `saveBlockEntities(cx, cz, entities: SerializedBlockEntity[])` — enqueue a
  full-snapshot dirty unit `block-entities|world|cx|cz` (dedup by key; last writer wins);
- `loadBlockEntities(cx, cz): Promise<SerializedBlockEntity[] | null>`;
- `listAllBlockEntities(): Promise<...>` used by boot hydration.

No localStorage fallback: world-authoritative furnace data flows exclusively through the 036
IndexedDB store. Autosave cadence, pagehide flush, quota handling, and health surfacing are
the existing coordinator's — unchanged.

Proven scenarios map onto existing mechanics: ordinary autosave (coordinator interval),
explicit flush (`flush()` on pagehide/dispose), page reload (boot hydration), chunk
unload/reload (resident-state + eager flush), edit-during-in-flight-write (full-snapshot
units make the newer mark supersede the queued one before it drains), break-after-reload
(removeFurnace deletes the runtime instance; next chunk-unit write omits it, and an explicit
delete of the stale record guards the empty-chunk case).

### Breaking/drops (Phase F)

Policy (explicitly chosen, Minecraft-like): breaking a furnace drops the furnace item itself
(through its normal loot path) **plus** every contained stack as world item entities at the
block center via the existing `ItemEntityManager.spawnLootStacks`. The instance is removed
exactly once by the host; if the furnace's panel is open it is closed first (cursor returned),
so no ghost reference can survive. Accumulated xp is dropped as an orb using the existing
xp-orb spawn seam.

### Recovery/adversarial behavior (Phase G)

All persisted payloads pass through `deserializeFurnaceState` (strict validation). Malformed
records are quarantined: the record is skipped with a console.warn and surfaced through the
existing degraded-save status rather than crashing boot; the block remains a normal furnace
with a fresh state. Stale records whose block is no longer a furnace are ignored (and their
record deleted lazily). Destroyed-during-save, unload-during-burn, repeated open/close, and
repeated save/reload are covered by deterministic unit tests; storage failure inherits the
facade's offline-first degradation.

## Risks and rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Divergent furnace state copies | single authoritative payload; views derive+write back atomically | revert Game wiring; headless modules untouched |
| Double ticking across chunk edges | simulating-set gate identical to mobs; one manager, one instance per position | host flag to disable ticking |
| Save/write races losing edits | full-snapshot dirty units keyed per chunk (038 semantics, proven) | none needed |
| Panel/input regressions | panel pauses simulation exactly like crafting; E2E journey asserts input isolation | hide panel behind feature flag constant |
| Coverage thresholds | new production code ships with new tests in the same commit group | n/a |

Rollback overall: the campaign is additive behind `LiveBlockEntityHost`; reverting the Game
wiring commit restores the pre-251 behavior without touching verified headless modules.
