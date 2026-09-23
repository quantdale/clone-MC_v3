/**
 * Live raid persistence codec seam (283): thin, fail-closed wrappers over the
 * verified `RaidStateMachine` codec for storage and archive boundaries.
 *
 * Runtime load (`deserializeRaidPayload`) never throws — missing, non-object,
 * stale, or malformed payloads degrade to `null` so boot cannot crash and no
 * partial raid is hydrated. Archive validation (`validatePersistedRaid`) throws
 * before the first store write so a malformed `raidData` field aborts the whole
 * migration (fail-closed). `serializeRaidPayload` is a pure pass-through to
 * `serializeRaid` and never throws for a well-formed `RaidState`.
 *
 * No entity registration, no IndexedDB I/O, no Game wiring — see
 * `openspec/changes/283-live-raid-persistence/design.md`.
 */

import {
  RAID_RECORD_VERSION,
  deserializeRaid,
  serializeRaid,
  type RaidState,
  type SerializedRaid,
} from './RaidStateMachine';

export type { RaidState, SerializedRaid } from './RaidStateMachine';

/** Store schema version; mirrors {@link RAID_RECORD_VERSION} (1). */
export const RAID_STORE_VERSION = RAID_RECORD_VERSION;

/**
 * Runtime load: reconstruct a `RaidState` from an untrusted storage payload.
 * Returns `null` for a missing record, a non-object payload, a stale
 * `schemaVersion`, or any other `deserializeRaid` rejection. Never throws.
 */
export function deserializeRaidPayload(payload: unknown): RaidState | null {
  if (payload === null || payload === undefined) return null;
  try {
    return deserializeRaid(payload);
  } catch {
    return null;
  }
}

/**
 * Archive boundary: validate an untrusted `raidData` field and return the
 * normalized `SerializedRaid` envelope. Throws on a non-object payload, a
 * stale `schemaVersion` (named in the error), or any `deserializeRaid`
 * rejection — always before the caller performs a store write.
 */
export function validatePersistedRaid(payload: unknown): SerializedRaid {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('RaidPersistence: malformed raid payload');
  }
  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== RAID_STORE_VERSION) {
    throw new Error(`RaidPersistence: unsupported schemaVersion ${String(record.schemaVersion)}`);
  }
  return serializeRaid(deserializeRaid(payload));
}

/**
 * Serialize live state through the verified `serializeRaid` codec. Pure;
 * never throws for a well-formed `RaidState`.
 */
export function serializeRaidPayload(state: RaidState): SerializedRaid {
  return serializeRaid(state);
}
