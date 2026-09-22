# Design: 283-live-raid-persistence

## Context/current state

- `RaidStateMachine` (152) is pure and VERIFIED: `startRaid` / `tickRaid` /
  `recordRaiderDeath` / `spawnWave` plus `serializeRaid` → `SerializedRaid`
  (`schemaVersion: 1`) and `deserializeRaid`, which throws on malformed payloads (bad
  version, unknown status, non-finite coords, non-negative-integer counters violated, or
  `waveIndex > totalWaves`) before returning any state.
- Change 282 gives the live `Game` one ephemeral `raidState: RaidState | null`, one
  `tickRaid` per unpaused fixed tick, `debugStartRaid` / `debugClearRaidWave` /
  `getRaidState()`, and the `#raid-feedback` bar projected by `RaidFeedbackView`. 282
  explicitly does **not** persist: reload yields `getRaidState() === null` and a hidden bar.
- The storage layer already has a raw world-metadata namespace pattern used by
  `__weather__` (275) and `__trades__` (278): `WorldMetadataRepository.putX/getX`,
  `GamePersistence` bulk-load + `saveX` + reset snapshot/restore/delete, optional
  `WorldArchive.xData` with pre-write validation, and `WorldArchiver` export/import plus an
  `xDataImported` report flag.
- There is no `__raid__` key, no `raidData` archive field, and no Game save/hydrate path for
  raids anywhere in `src/storage/` or `src/engine/Game.ts` today.

## Target state

- `Game.raidState` remains the single live authority. On boot, if a valid `__raid__` record
  exists it is hydrated before the first fixed tick; otherwise the field stays `null`.
- `__raid__:<worldId>` stores the `SerializedRaid` payload produced by `serializeRaid`.
- `saveRaid()` runs at the existing autosave, dispose, and pagehide points (weather/trading
  guards: no persistence ⇒ no-op; recovery-required ⇒ no-op).
- Reset deletes `__raid__:<worldId>`. Archives optionally carry `raidData`; import validates
  with `deserializeRaid` before the first write and reports `raidDataImported`.
- 282's `#raid-feedback` projection and debug seams are unchanged; they simply see a
  non-null state after reload when a record was saved.

## Invariants

- I-1: `RaidStateMachine` remains the only authority for status, wave, counters, and timeout;
  persistence only stores and restores `serializeRaid` / `deserializeRaid` output.
- I-2: At most one `__raid__` record exists per world (single key; each save overwrites
  atomically — last write wins, never a second parallel record).
- I-3: Runtime load of a corrupt/absent/stale payload yields `raidState === null` and never
  throws out of boot; no partial state is written back on failure.
- I-4: Archive import of a present-but-malformed `raidData` throws before any store write
  (fail-closed migration); absent `raidData` imports as `null`.
- I-5: No raider entity types are registered, spawned, or referenced by this change.
- I-6: 282's projection, fixed-tick, pause, and dispose-hide behavior is unchanged; only the
  store behind `raidState` gains a durable path.
- I-7: Change 258 stays BLOCKED; no headed FPS/GPU work is in scope.

## API and data model

```ts
// Namespace key (WorldMetadataRepository)
// worldId: `__raid__:<worldId>`

// Pure persistence seam (new module, e.g. RaidPersistence.ts)
export const RAID_STORE_VERSION = 1; // mirrors RAID_RECORD_VERSION

/** Runtime load: never throws. Invalid/stale/corrupt → null. */
export function deserializeRaidPayload(payload: unknown): RaidState | null;

/** Archive boundary: throws on malformed payload before write. */
export function validatePersistedRaid(payload: unknown): SerializedRaid;

/** Serialize live state (thin wrapper over serializeRaid; never throws for valid state). */
export function serializeRaidPayload(state: RaidState): SerializedRaid;

// WorldMetadataRepository
putRaidData(worldId: string, payload: unknown): Promise<void>;
getRaidData(worldId: string): Promise<unknown | null>;

// GamePersistence
initialRaidValue: SerializedRaid | null;   // bulk-load on open, corrupt ⇒ null
saveRaid(payload: unknown): void;          // guarded like saveWeather/saveTrading
// reset: snapshot __raid__, delete, restore on failure (weather precedent)

// WorldArchive
raidData?: unknown | null;                 // optional; absent ⇒ null

// WorldArchiver
raidDataImported: boolean;                 // report flag

// Game (extends 282)
saveRaid(): void;                          // serializeRaid(raidState) when non-null
// boot: raidState = deserializeRaidPayload(initialRaidValue)  // null-safe
```

`validatePersistedRaid` accepts only an object that `deserializeRaid` reconstructs without
throwing; it re-checks `schemaVersion === RAID_RECORD_VERSION` explicitly so stale versions
are named in the error.

## Control/data flow

1. **Boot**: `GamePersistence.open` bulk-loads `__raid__` raw →
   `deserializeRaidPayload` (`null` on any defect) → `Game.raidState`. Late-load parity
   mirrors sleep/weather (constructor default `null`, replace when open settles).
2. **Runtime tick**: unchanged from 282 — one `tickRaid` per unpaused fixed tick on an
   active state; HUD projection unchanged.
3. **Save**: autosave / dispose / pagehide call `Game.saveRaid()` → `serializeRaid` →
   `GamePersistence.saveRaid` → `putRaidData`. Null state saves `null` (record absent or
   cleared per reset semantics: saving null deletes the key, keeping I-2).
4. **Reset**: world reset snapshots `__raid__`, deletes it, restores the snapshot if the
   broader reset fails (weather snapshot/restore precedent).
5. **Archive export**: `WorldArchiver` reads `getRaidData` into `raidData` (null when
   absent).
6. **Archive import**: `validateWorldArchive` runs `validatePersistedRaid` when `raidData`
   is present and non-null (throws ⇒ no write); `WorldArchiver` writes the key and sets
   `raidDataImported`.
7. **Dispose**: 282 still hides the bar and clears the transient reference after the final
   `saveRaid` attempt; no post-dispose mutation.

## Detailed behavior

- Valid `ACTIVE` payload at boot restores status, center, wave, counters, omen, and ticks
  exactly (round-trip equality with `serializeRaid` output).
- `VICTORY` / `DEFEAT` payloads restore as terminal; 282's projection keeps showing the
  terminal bar until a new start or dispose (same as live terminal behavior today).
- Absent record, `null` payload, non-object payload, wrong `schemaVersion`, unknown status,
  non-finite center, negative/fractional counters, or `waveIndex > totalWaves` ⇒ runtime
  load returns `null` (bar hidden, `getRaidState()` null).
- Duplicate saves: second `putRaidData` on the same key replaces the first; no duplicate
  rows are possible under the single-key namespace.
- Stale schema: any payload whose `schemaVersion !== 1` is rejected at both the runtime and
  archive boundaries (fail-closed; no forward-compat half-parse).
- `saveRaid` with `raidState === null` deletes the `__raid__` key (or writes an explicit
  absent marker consistent with the weather null-save path) so a cleared raid does not
  resurrect on next boot.

## Failure modes

- Corrupt IndexedDB read ⇒ `getRaidData` returns `null` or throws into the existing
  persistence error path; boot degrades to `raidState === null` and never partially
  hydrates.
- Quota / recovery-required ⇒ `saveRaid` is a guarded no-op (same as `saveWeather`).
- Archive with malformed `raidData` ⇒ `validateWorldArchive` throws; `WorldArchiver` aborts
  before the first `put` (no partial import).
- Double dispose / dispose+pagehide ⇒ idempotent save guards; one key, last write wins.
- 282 missing DOM element ⇒ unchanged presentation no-op; persistence is independent.

## Compatibility/migration

- Additive record + optional archive field only. Old saves boot with `raidState === null`.
- Reset deletes the record; export/import carries it optionally.
- Older builds ignore `__raid__` and unknown `raidData` (never parsed).
- Fail-closed migration is the archive boundary; runtime degrade is the boot boundary. The
  two are intentionally different: boot must not crash, import must not silently persist
  garbage.

## Performance/resource constraints

- One O(1) serialize + one metadata put per save point (autosave/dispose/pagehide); one
  get + one `deserializeRaid` at boot. No per-tick disk work, no entity iteration, no
  worker/GPU path. Payload is a single small `SerializedRaid` object.

## Testing seams

- Unit: `deserializeRaidPayload` / `validatePersistedRaid` (round-trip, every rejection
  class, absent⇒null, stale version); Game composition (hydrate, save guards, reset
  delete/restore, archive passthrough).
- Browser: `__voxelGame` start raid → `pagehide` reload → same wave/remaining restored and
  bar visible; reset → reload → null; optional export/import leg via existing archive E2E
  harness.
- Reuse 282's `getRaidState()` as the read-only E2E observable; no new HUD.

## Observability/debugging

- `getRaidState()` exposes the hydrated or live state for E2E assertions.
- `WorldImportReport.raidDataImported` distinguishes carried vs absent raid records.
- No new user-facing toasts or panels; `#raid-feedback` remains the only presentation.

## Affected files/symbols

- NEW `src/simulation/RaidPersistence.ts` (pure codec seam).
- EDIT `src/storage/WorldMetadataRepository.ts` (`putRaidData`/`getRaidData`).
- EDIT `src/storage/GamePersistence.ts` (`initialRaidValue`, `saveRaid`, reset hooks).
- EDIT `src/storage/WorldArchive.ts` (`raidData?`) + `WorldArchiver.ts` (export/import +
  report flag).
- EDIT `src/engine/Game.ts` (boot hydrate, `saveRaid` at autosave/dispose/pagehide, reset).
- NEW `tests/unit/RaidPersistence.test.ts`, `tests/unit/LiveRaidPersistence.test.ts`.
- NEW `tests/e2e/raid-persistence.spec.ts`.
- EDIT `PARITY_MATRIX.md` (C283 row), `PROGRAM_STATE.*`, `CHANGE_SEQUENCE*` — **at
  activation on `origin/main` after 282 is VERIFIED**, not from this authoring branch.
- This package + `OVERRIDE_DRAFT.md`.

## Rejected alternatives

- Reusing an existing namespace (`__weather__`, `block-entities`, player snapshot): rejected —
  raid state has an independent lifecycle and a strict codec; sharing a key would couple
  unrelated reset/archive rules.
- Persisting only through the 282 HUD (no store): rejected — the goal is reload survival;
  presentation-only state dies with the page by definition.
- Storing raw `RaidState` without `serializeRaid`: rejected — would bypass the verified
  strict codec and weaken fail-closed validation.
- Auto-clearing terminal raids on boot: rejected — terminal state is inspectable today and
  must round-trip; clearing is an explicit future product decision, not a persistence rule.
- Immediate raider spawning on hydrate: rejected — out of scope (no entity registration in
  282 or 283).

## Downstream dependencies

- Future raider/settlement work (post-283) consumes the same `__raid__` record and must keep
  `deserializeRaid` as the sole decoder.
- Future multiplayer server persistence (234) may own the codec server-side; the client
  namespace here is single-player world-scoped only.
- Change 284+ (if any) MUST NOT reopen 282's projection contract or 258's BLOCKED status.
