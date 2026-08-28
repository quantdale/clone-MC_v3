# Design: 043-storage-quota-recovery

## Context / current state

The five repositories reject failed IndexedDB operations, but there is no aggregate health view and no
classification. The 039 autosave coordinator cannot distinguish "one transient failure" from "storage
is broken".

## Target state

A `StorageHealthMonitor` classifies probe failures, tracks `ok → degraded → failed`, exposes
`canWrite()`, notifies listeners on transitions, and recovers on a successful probe. A
`createWorldStorageProbe` exercises the real five-repository path (open + tiny write/read/delete with a
reserved key) so quota/private-mode failures surface as classified errors.

## Invariants

- `StorageStatus = 'ok' | 'degraded' | 'failed'`; `StorageFailureKind = 'quota' | 'private-mode' |
  'unavailable' | 'unknown'`.
- Consecutive probe failures: 0 → `ok`; 1 → `degraded`; ≥2 → `failed`.
- A successful probe resets consecutive failures to 0 and clears `lastFailure`.
- `canWrite()` is false exactly when status is `failed`.
- Listeners are invoked only on status *change*; `onStatusChange` returns an unsubscribe function.
- The world probe writes a record with world id `__probe__` and deletes it in `finally` (success or
  failure); a healthy probe leaves the store exactly as it was.

## API and data model

```ts
// src/storage/StorageHealth.ts
export type StorageStatus = 'ok' | 'degraded' | 'failed';
export type StorageFailureKind = 'quota' | 'private-mode' | 'unavailable' | 'unknown';
export interface StorageFailure { kind: StorageFailureKind; message: string; at: number; }
export interface StorageProbe { probe(): Promise<void>; }
export function classifyStorageError(error: unknown): StorageFailureKind;
export class StorageHealthMonitor {
  constructor(opts: { probe: StorageProbe });
  async check(): Promise<StorageStatus>;
  get status(): StorageStatus;
  get lastFailure(): StorageFailure | null;
  canWrite(): boolean;
  onStatusChange(listener: (status: StorageStatus) => void): () => void;
  reset(): void;
}
export interface WorldStorageProbeDeps {
  metadata: WorldMetadataRepository;
  chunkSections: ChunkSectionRepository;
  blockEntities: BlockEntityRepository;
  entities: EntityRepository;
  playerStates: PlayerStateRepository;
}
export const WORLD_PROBE_WORLD_ID = '__probe__';
export function createWorldStorageProbe(deps: WorldStorageProbeDeps): StorageProbe;
```

## Control / data flow

1. `check()`: `try { await probe.probe(); consecutiveFailures = 0; lastFailure = null; status = 'ok'; }
   catch (e) { consecutiveFailures++; lastFailure = { kind: classifyStorageError(e), message,
   at: Date.now() }; status = consecutiveFailures >= 2 ? 'failed' : 'degraded'; }`; notify listeners
   when status changed; return status.
2. `createWorldStorageProbe`: opens all five repos; `putMetadata(probeMetadata)` (world id
   `__probe__`), `getMetadata('__probe__')` (assert non-null), `deleteMetadata('__probe__')`; all inside
   try/finally where `finally` deletes the probe record best-effort. An open failure propagates
   (`SecurityError` in private mode → `private-mode`; `NotFoundError`/etc → `unavailable`).
3. `classifyStorageError`: checks `error.name`/`error.code`:
   - `QuotaExceededError` / 22 → `quota`;
   - `SecurityError` / 18 → `private-mode`;
   - `UnknownError` / `InvalidStateError` → `unavailable`;
   - else → `unknown`.

## Detailed behavior

- Probe metadata uses a minimal valid `WorldMetadata` (schemaVersion 1, seed 0, `__probe__` world id).
- `reset()` restores the initial state (`ok`, no failure, listeners kept).
- Listener changes: only fired when the derived status differs from the previous status.
- `check()` is safe to call concurrently/periodically (e.g. from the 039 coordinator's tick).

## Failure modes

- Probe throws (quota/private-mode/unknown) → monitor records the classified failure and degrades.
- Cleanup delete fails (e.g. quota on delete is unlikely; best-effort `catch` in `finally`).
- Missing repository deps → probe throws → classified `unknown` (or `unavailable` via open failure).

## Compatibility / migration

No `WORLD_DB_VERSION` change; no stored-data impact (probe record removed in all paths).

## Performance / resource constraints

`check()` is a small read-write round-trip; intended to run on autosave ticks or explicit intervals,
not per frame.

## Testing seams

- `tests/unit/StorageHealth.test.ts`:
  - classification: synthetic errors by name and by numeric code;
  - monitor: ok probe → `ok`/canWrite; one failure → `degraded` + kind + canWrite true; two
    consecutive failures → `failed` + canWrite false; success after failures → `ok` + lastFailure null
    (recovery); listeners fire on change only; unsubscribe; `reset`;
  - world probe: healthy in-memory mock repositories → probe succeeds and `listMetadata()` contains no
    `__probe__` record; a metadata repository whose `putMetadata` throws (quota simulation via a
    wrapper) → probe rejects and the failure classifies as expected.

## Observability / debugging

`status`, `lastFailure` (kind + message + timestamp), and change notifications give the game a
complete storage health picture.

## Affected files / symbols

- `src/storage/StorageHealth.ts` — NEW.
- `tests/unit/StorageHealth.test.ts` — NEW.

## Rejected alternatives

- *Per-write failure counting inside repositories*: scatters health across boundaries and misses
  open/private-mode failures; a single probe + monitor is the minimal aggregate.
- *navigator.storage.estimate()*: not reliable for detecting private mode and not synchronous with
  writes; a real write probe is authoritative.

## Downstream dependencies

240 (save-recovery stress) drives `check`/recovery matrices; the game wires `onStatusChange` to UI and
pauses 039 autosave when `canWrite()` is false.
