# Proposal: 043-storage-quota-recovery

## Problem

034-042 persist worlds through IndexedDB, but nothing detects or reacts to storage failures: quota
exhaustion (`QuotaExceededError`), private mode / blocked storage (`SecurityError`), or a missing
IndexedDB. Today a failing write is only caught per-call by the repositories' promise rejection, with
no health state, no classification, and no user-safe policy (e.g. stop autosaving once storage is
provably broken).

## Goals

- Classify storage failures deterministically: `quota`, `private-mode`, `unavailable`, `unknown`.
- Provide a `StorageHealthMonitor` that probes storage on demand, tracks `ok | degraded | failed`
  status, remembers the last failure, notifies listeners on status change, and recovers when a later
  probe succeeds.
- Provide a real `createWorldStorageProbe` over the five 034-042 repositories (open all + a tiny
  write/read/delete round-trip with a reserved probe key, cleaned up in all paths).
- User-safe policy: one transient failure → `degraded` (warnings, writes still allowed); repeated
  consecutive failures → `failed` (`canWrite()` false, autosave should stop); a successful probe
  restores `ok`.

## Non-goals

- UI/toasts (the game wires `onStatusChange`), quota-estimate APIs, or storage-eviction handling.
- Automatically stopping the 039 autosave coordinator (wiring is the game's job; the monitor exposes
  `canWrite()` and status events).

## Preconditions

- Change 042 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 042 baseline (585 unit / 19 e2e).

## Dependencies

- The five repositories (034-040) for `createWorldStorageProbe`.
- Browser DOMException naming conventions (`QuotaExceededError`, `SecurityError`) plus numeric codes.

## Proposed change

- `src/storage/StorageHealth.ts` (NEW): `StorageStatus`, `StorageFailureKind`,
  `classifyStorageError`, `StorageProbe`, `StorageHealthMonitor` (`check`, `status`, `lastFailure`,
  `canWrite`, `onStatusChange`, `reset`), and `createWorldStorageProbe(deps)` using a reserved probe
  world id that is deleted after the probe in all paths.
- `tests/unit/StorageHealth.test.ts` (NEW).

## Compatibility and migration

No `WORLD_DB_VERSION` change; the monitor is additive and touches no stored data (probe record is
removed immediately).

## Risks

- The probe write could itself trigger quota on an already-full database; that is exactly the
  detection we want, and the probe record is the smallest possible record.
- Probe key collision: a reserved `__probe__` world id; the probe always deletes it in `finally`.
- DOMException name/code coverage varies by browser; classification falls back to `unknown` and the
  monitor still marks the status, keeping the policy safe.

## Rollback strategy

Revert the commit; the monitor is additive and leaves no persisted state.

## Definition of Done

- `classifyStorageError` maps QuotaExceededError/22 → `quota`, SecurityError/18 → `private-mode`,
  and other failures → `unavailable`/`unknown`.
- `StorageHealthMonitor` transitions `ok → degraded → failed` on consecutive probe failures and back to
  `ok` on success; `canWrite()` is false only when `failed`; listeners fire on change.
- `createWorldStorageProbe` succeeds on healthy repositories and leaves no `__probe__` record.
- Unit tests cover classification, transitions, recovery, listeners, reset, and the world probe.
- Full gate green; 043 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 043 suite; E2E stays 19/19.
