/**
 * Pure headless reconnect state recovery framework (235).
 *
 * Server side (`ReconnectStateManager`): a per-profile session-epoch tracker that issues a
 * fresh, strictly increasing `SessionEpoch` per connect, detects reconnects, ends sessions on
 * disconnect, rejects any epoch that is not the active session's epoch (stale/replay and
 * mid-transaction-disconnect protection for every sub-protocol), keeps a bounded
 * connect/disconnect history, and assembles a validated, deterministic `FullStateSnapshot`
 * (`collectFullState`) that reuses the established 226/229/231 payload shapes.
 *
 * Client side (`ReconnectStateClient`): tracks the client's replicated-state summary,
 * produces its `ClientStateSignature`, and applies a `FullStateSnapshot` — replacing the
 * summary wholesale, clearing `resyncPending`, and returning a `ClientResyncDirective` the
 * caller executes against the existing movement/inventory/block/chunk/entity reconcilers
 * and stores via their documented `reset()`/reseed hooks. The directive is data only; this
 * module never touches those components.
 *
 * `compareSignatures` decides deterministically, in a fixed check order, whether a client
 * needs a full resync and reports the first diverging field. An epoch difference always
 * forces a resync, so any reconnect requires a full snapshot.
 *
 * Strict `Reconnect: <detail>` validation everywhere, deterministic ordering, defensive
 * copies, zero DOM/IO; fully unit-testable headlessly.
 */

import { columnKey, type ChunkSnapshot } from './ChunkStreaming';
import type { EntitySpawnDescriptor } from './EntityReplication';
import type { ItemStack, WindowSlots } from './InventoryTransactionNetworking';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/** A non-negative safe integer uniquely identifying one connection session for a profile. */
export type SessionEpoch = number;

export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The client's summary of its replicated state (what it believes it has applied). */
export interface ClientStateSignature {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly inventoryStateId: number;
  /** Chunk keys in the client's interest, sorted. */
  readonly interest: readonly string[];
  /** Entity ids replicated client-side, sorted. */
  readonly entities: readonly number[];
}

/** The server-authoritative summary the client is compared against. */
export interface ServerStateSignature {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly inventoryStateId: number;
  /** Server interest chunk keys, sorted. */
  readonly interest: readonly string[];
  /** Server in-range tracked entity ids, sorted. */
  readonly entities: readonly number[];
}

export type ResyncVerdict =
  | { readonly needsResync: false; readonly reasons: readonly [] }
  | { readonly needsResync: true; readonly reasons: readonly string[] };

/** The full authoritative inventory window (payload shape from 231). */
export interface InventorySnapshot {
  readonly stateId: number;
  readonly slots: readonly (ItemStack | null)[];
  /** Exactly 9 slots. */
  readonly hotbar: readonly (ItemStack | null)[];
  readonly cursorItem: ItemStack | null;
}

/** Host-supplied inputs for assembling a full-state snapshot. */
export interface FullStateInput {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly chunks: readonly ChunkSnapshot[];
  readonly entities: readonly EntitySpawnDescriptor[];
  readonly inventory: InventorySnapshot;
}

/** The validated, deterministic authoritative snapshot a reconnecting client is rebuilt from. */
export interface FullStateSnapshot {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  /** Sorted, unique chunk keys. */
  readonly chunkKeys: readonly string[];
  /** Chunk snapshots in the same sorted-key order. */
  readonly chunkSnapshots: readonly ChunkSnapshot[];
  /** Entity spawn descriptors sorted by ascending id. */
  readonly entities: readonly EntitySpawnDescriptor[];
  readonly inventory: InventorySnapshot;
}

/** One concrete reset action the caller applies to a concrete reconciler/store. */
export type ResyncAction =
  | { readonly kind: 'reset_movement'; position: Position; tick: number }
  | {
      readonly kind: 'reset_inventory';
      stateId: number;
      slots: WindowSlots;
      hotbar: WindowSlots;
      cursorItem: ItemStack | null;
    }
  | { readonly kind: 'clear_block_predictions' }
  | { readonly kind: 'reset_chunks'; keys: readonly string[] }
  | { readonly kind: 'reset_entities'; entityIds: readonly number[] };

/** The ordered set of reset actions the caller executes against the concrete components. */
export interface ClientResyncDirective {
  readonly actions: readonly ResyncAction[];
}

export interface ConnectResult {
  readonly epoch: SessionEpoch;
  readonly isReconnect: boolean;
}

export interface ReconnectHistoryRecord {
  readonly profile: string;
  readonly kind: 'connect' | 'disconnect';
  readonly epoch: SessionEpoch;
}

export interface ReconnectStateManagerOptions {
  /** Bounded history log size; positive integer (default 32). */
  readonly historyLimit?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers (Reconnect: <detail>)
// ────────────────────────────────────────────────────────────────────────────

function fail(detail: string): never {
  throw new Error(`Reconnect: ${detail}`);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function requireNonNegSafeInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requireFinitePosition(value: unknown, label: string): Position {
  if (typeof value !== 'object' || value === null) {
    fail(`${label} must be finite numbers`);
  }
  const p = value as Record<string, unknown>;
  if (
    typeof p.x !== 'number' ||
    !Number.isFinite(p.x) ||
    typeof p.y !== 'number' ||
    !Number.isFinite(p.y) ||
    typeof p.z !== 'number' ||
    !Number.isFinite(p.z)
  ) {
    fail(`${label} must be finite numbers`);
  }
  return { x: p.x, y: p.y, z: p.z };
}

function requireChunkKey(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('chunk key must be a non-empty string');
  }
  return value;
}

function requireEntityId(value: unknown): number {
  return requireNonNegSafeInt(value, 'entity id');
}

function validateItemStack(value: unknown, label: string): ItemStack {
  if (typeof value !== 'object' || value === null) {
    fail(`${label} must be an object`);
  }
  const s = value as Record<string, unknown>;
  const id = s.id;
  const count = s.count;
  const maxCount = s.maxCount;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) {
    fail(`${label}.id must be a non-negative safe integer`);
  }
  if (typeof maxCount !== 'number' || !Number.isSafeInteger(maxCount) || maxCount <= 0) {
    fail(`${label}.maxCount must be a positive safe integer`);
  }
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > maxCount) {
    fail(`${label}.count must be in [1, maxCount]`);
  }
  return { id, count, maxCount };
}

function validateSlots(value: unknown, label: string): (ItemStack | null)[] {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value.map((s, i) => (s === null || s === undefined ? null : validateItemStack(s, `${label}[${i}]`)));
}

function validateInventoryWindow(value: unknown): InventorySnapshot {
  if (typeof value !== 'object' || value === null) {
    fail('inventory must be an object');
  }
  const i = value as Record<string, unknown>;
  const stateId = requireNonNegSafeInt(i.stateId, 'inventory.stateId');
  const slots = validateSlots(i.slots, 'inventory.slots');
  if (!Array.isArray(i.hotbar)) {
    fail('inventory.hotbar must be an array');
  }
  if (i.hotbar.length !== 9) {
    fail('inventory.hotbar must have exactly 9 slots');
  }
  const hotbar = validateSlots(i.hotbar, 'inventory.hotbar');
  const cursorItem =
    i.cursorItem === null || i.cursorItem === undefined
      ? null
      : validateItemStack(i.cursorItem, 'inventory.cursorItem');
  return { stateId, slots, hotbar, cursorItem };
}

function validateChunkSnapshot(value: unknown): ChunkSnapshot {
  if (typeof value !== 'object' || value === null) {
    fail('chunk snapshot must be an object');
  }
  const s = value as Record<string, unknown>;
  const x = s.x;
  const z = s.z;
  const key = s.key;
  const tick = s.tick;
  const sections = s.sections;
  if (typeof x !== 'number' || !Number.isInteger(x) || typeof z !== 'number' || !Number.isInteger(z)) {
    fail('chunk snapshot coordinates must be integers');
  }
  if (typeof key !== 'string' || key !== columnKey(x, z)) {
    fail(`chunk snapshot key ${String(key)} does not match (${String(x)}, ${String(z)})`);
  }
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) {
    fail('chunk snapshot tick must be a non-negative safe integer');
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    fail('chunk snapshot sections must be a non-empty array');
  }
  const seenY = new Set<number>();
  for (const section of sections) {
    if (typeof section !== 'object' || section === null) {
      fail('chunk snapshot section must be an object');
    }
    const sec = section as Record<string, unknown>;
    const secY = sec.y;
    const secData = sec.data;
    if (typeof secY !== 'number' || !Number.isInteger(secY)) {
      fail('chunk snapshot section y must be an integer');
    }
    if (seenY.has(secY)) {
      fail(`chunk snapshot duplicate section y ${String(secY)}`);
    }
    seenY.add(secY);
    if (!Array.isArray(secData) || secData.length === 0) {
      fail('chunk snapshot section data must be a non-empty array');
    }
    for (const dataValue of secData) {
      if (typeof dataValue !== 'number' || !Number.isSafeInteger(dataValue) || dataValue < 0) {
        fail('chunk snapshot section data must be non-negative safe integers');
      }
    }
  }
  return { key, x, z, sections, tick };
}

function validateEntityDescriptor(value: unknown): EntitySpawnDescriptor {
  if (typeof value !== 'object' || value === null) {
    fail('entity descriptor must be an object');
  }
  const d = value as Record<string, unknown>;
  const id = requireEntityId(d.id);
  const type = d.type;
  if (typeof type !== 'string' || type.trim().length === 0) {
    fail('entity type must be a non-empty string');
  }
  const position = requireFinitePosition(d.position, 'entity position');
  let yaw: number | undefined;
  if (d.yaw !== undefined) {
    const y = d.yaw;
    if (typeof y !== 'number' || !Number.isFinite(y)) {
      fail('entity yaw must be a finite number');
    }
    yaw = y;
  }
  let pitch: number | undefined;
  if (d.pitch !== undefined) {
    const p = d.pitch;
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      fail('entity pitch must be a finite number');
    }
    pitch = p;
  }
  let velocity: { readonly vx: number; readonly vy: number; readonly vz: number } | undefined;
  if (d.velocity !== undefined && d.velocity !== null) {
    const vel = d.velocity as Record<string, unknown>;
    if (typeof vel !== 'object' || vel === null) {
      fail('entity velocity must be an object');
    }
    const vx = vel.vx;
    const vy = vel.vy;
    const vz = vel.vz;
    if (
      typeof vx !== 'number' ||
      !Number.isFinite(vx) ||
      typeof vy !== 'number' ||
      !Number.isFinite(vy) ||
      typeof vz !== 'number' ||
      !Number.isFinite(vz)
    ) {
      fail('entity velocity components must be finite numbers');
    }
    velocity = { vx, vy, vz };
  }
  let trackedData: { readonly id: number; readonly value: unknown }[] | undefined;
  if (d.trackedData !== undefined && d.trackedData !== null) {
    if (!Array.isArray(d.trackedData)) {
      fail('entity trackedData must be an array');
    }
    trackedData = d.trackedData.map((entry, i) => {
      if (typeof entry !== 'object' || entry === null) {
        fail(`entity trackedData[${i}] must be an object`);
      }
      const e = entry as Record<string, unknown>;
      const entryId = requireNonNegSafeInt(e.id, `entity trackedData[${i}].id`);
      return { id: entryId, value: e.value };
    });
  }
  return {
    id,
    type,
    position,
    ...(yaw !== undefined ? { yaw } : {}),
    ...(pitch !== undefined ? { pitch } : {}),
    ...(velocity !== undefined ? { velocity } : {}),
    ...(trackedData !== undefined ? { trackedData } : {}),
  };
}

interface ValidatedSignature {
  readonly profile: string;
  readonly epoch: number;
  readonly tick: number;
  readonly position: Position;
  readonly inventoryStateId: number;
  readonly interest: string[];
  readonly entities: number[];
}

function validateSignature(value: unknown, label: string): ValidatedSignature {
  if (typeof value !== 'object' || value === null) {
    fail(`${label} must be an object`);
  }
  const s = value as Record<string, unknown>;
  const profile = requireNonEmptyString(s.profile, `${label}.profile`);
  const epoch = requireNonNegSafeInt(s.epoch, `${label}.epoch`);
  const tick = requireNonNegSafeInt(s.tick, `${label}.tick`);
  const position = requireFinitePosition(s.position, `${label}.position`);
  const inventoryStateId = requireNonNegSafeInt(s.inventoryStateId, `${label}.inventoryStateId`);
  if (!Array.isArray(s.interest)) {
    fail(`${label}.interest must be an array`);
  }
  const interest = s.interest.map((k, i) => {
    if (typeof k !== 'string' || k.length === 0) {
      fail(`${label}.interest[${i}] must be a non-empty string`);
    }
    return k;
  });
  if (!Array.isArray(s.entities)) {
    fail(`${label}.entities must be an array`);
  }
  const entities = s.entities.map((e, i) => {
    if (typeof e !== 'number' || !Number.isSafeInteger(e) || e < 0) {
      fail(`${label}.entities[${i}] must be a non-negative safe integer`);
    }
    return e;
  });
  return { profile, epoch, tick, position, inventoryStateId, interest, entities };
}

function setEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  for (const v of a) {
    if (!set.has(v)) return false;
  }
  return true;
}

function numSetEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  for (const v of a) {
    if (!set.has(v)) return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Divergence detection
// ────────────────────────────────────────────────────────────────────────────

const COMPARE_FIELDS: readonly {
  readonly reason: string;
  readonly equal: (c: ValidatedSignature, s: ValidatedSignature) => boolean;
}[] = [
  { reason: 'profile mismatch', equal: (c, s) => c.profile === s.profile },
  { reason: 'epoch mismatch', equal: (c, s) => c.epoch === s.epoch },
  { reason: 'tick mismatch', equal: (c, s) => c.tick === s.tick },
  {
    reason: 'position mismatch',
    equal: (c, s) => c.position.x === s.position.x && c.position.y === s.position.y && c.position.z === s.position.z,
  },
  { reason: 'inventory state mismatch', equal: (c, s) => c.inventoryStateId === s.inventoryStateId },
  { reason: 'interest mismatch', equal: (c, s) => setEqual(c.interest, s.interest) },
  { reason: 'entity set mismatch', equal: (c, s) => numSetEqual(c.entities, s.entities) },
];

/**
 * Decide whether the client needs a full resync against the authoritative server signature.
 * Equal on profile, epoch, tick, position, inventoryStateId, and (order-independently) the
 * interest and entity sets yields `{ needsResync: false }`; otherwise the FIRST difference in
 * the fixed check order yields `needsResync: true` with a single reason code. Both signatures
 * are validated before any comparison.
 */
export function compareSignatures(client: ClientStateSignature, server: ServerStateSignature): ResyncVerdict {
  const c = validateSignature(client, 'client signature');
  const s = validateSignature(server, 'server signature');
  for (const field of COMPARE_FIELDS) {
    if (!field.equal(c, s)) {
      return { needsResync: true, reasons: [field.reason] };
    }
  }
  return { needsResync: false, reasons: [] };
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side session-epoch tracker
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_HISTORY_LIMIT = 32;

/**
 * Server-side per-profile session-epoch tracker (235). Issues a fresh strictly increasing
 * epoch per connect, detects reconnects, ends sessions on disconnect, rejects any epoch that
 * is not the active session's epoch, keeps a bounded connect/disconnect history, and assembles
 * validated deterministic full-state snapshots.
 */
export class ReconnectStateManager {
  private readonly historyLimit: number;
  private readonly nextEpochs = new Map<string, number>();
  private readonly active = new Map<string, SessionEpoch>();
  private readonly history_: ReconnectHistoryRecord[] = [];
  private epochCount_ = 0;

  constructor(options?: ReconnectStateManagerOptions) {
    const limit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0) {
      fail('historyLimit must be a positive integer');
    }
    this.historyLimit = limit;
  }

  /**
   * Issue a fresh session epoch for `profile`. The first connect for a profile returns epoch 1
   * with `isReconnect: false`; every later connect (while active or after disconnect) returns a
   * strictly greater epoch with `isReconnect: true` and immediately makes all prior epochs stale.
   */
  connect(profile: string): ConnectResult {
    const p = requireNonEmptyString(profile, 'profile');
    const next = (this.nextEpochs.get(p) ?? 0) + 1;
    this.nextEpochs.set(p, next);
    this.active.set(p, next);
    this.epochCount_ += 1;
    this.pushHistory({ profile: p, kind: 'connect', epoch: next });
    return { epoch: next, isReconnect: next > 1 };
  }

  /** End the active session for `profile`. Throws when no session is active; the epoch counter
   *  is retained so the next connect issues a fresh epoch. */
  disconnect(profile: string): void {
    const p = requireNonEmptyString(profile, 'profile');
    const epoch = this.active.get(p);
    if (epoch === undefined) {
      fail('profile has no active session');
    }
    this.active.delete(p);
    this.pushHistory({ profile: p, kind: 'disconnect', epoch });
  }

  /** True when the profile currently has an active session. */
  hasActiveSession(profile: string): boolean {
    const p = requireNonEmptyString(profile, 'profile');
    return this.active.has(p);
  }

  /** The active session's epoch, or null when the profile has no active session. */
  currentEpoch(profile: string): SessionEpoch | null {
    const p = requireNonEmptyString(profile, 'profile');
    return this.active.get(p) ?? null;
  }

  /**
   * True iff the profile has an active session AND `epoch` equals that session's epoch.
   * Every other epoch (previous sessions, replays, post-disconnect traffic) is rejected.
   */
  isSessionCurrent(profile: string, epoch: SessionEpoch): boolean {
    const p = requireNonEmptyString(profile, 'profile');
    const e = requireNonNegSafeInt(epoch, 'epoch');
    return this.active.get(p) === e;
  }

  /**
   * Assemble the validated deterministic full-state snapshot for the profile's current session.
   * Chunk keys are derived from the supplied snapshots, sorted and de-duplicated (a duplicate
   * key throws); chunk snapshots are emitted in the same sorted-key order; entity descriptors
   * are emitted sorted by ascending id (a duplicate id throws); the inventory window is
   * validated. Equivalent inputs produce identical outputs.
   */
  collectFullState(profile: string, input: FullStateInput): FullStateSnapshot {
    const p = requireNonEmptyString(profile, 'profile');
    if (typeof input !== 'object' || input === null) {
      fail('input must be an object');
    }
    if (typeof input.profile !== 'string' || input.profile !== p) {
      fail('input profile must match the requested profile');
    }
    const epoch = requireNonNegSafeInt(input.epoch, 'epoch');
    if (this.active.get(p) !== epoch) {
      fail('epoch is not the current session');
    }
    const tick = requireNonNegSafeInt(input.tick, 'tick');
    const position = requireFinitePosition(input.position, 'position');
    if (!Array.isArray(input.chunks)) {
      fail('input chunks must be an array');
    }
    const snapshots = input.chunks.map((c) => validateChunkSnapshot(c));
    const seenKeys = new Set<string>();
    const keyed = new Map<string, ChunkSnapshot>();
    for (const snapshot of snapshots) {
      if (seenKeys.has(snapshot.key)) {
        fail(`duplicate chunk key ${snapshot.key}`);
      }
      seenKeys.add(snapshot.key);
      keyed.set(snapshot.key, snapshot);
    }
    const chunkKeys = [...keyed.keys()].sort();
    if (!Array.isArray(input.entities)) {
      fail('input entities must be an array');
    }
    const descriptors = input.entities.map((d) => validateEntityDescriptor(d));
    const seenIds = new Set<number>();
    for (const descriptor of descriptors) {
      if (seenIds.has(descriptor.id)) {
        fail(`duplicate entity id ${descriptor.id}`);
      }
      seenIds.add(descriptor.id);
    }
    const entities = [...descriptors].sort((a, b) => a.id - b.id);
    const inventory = validateInventoryWindow(input.inventory);
    return {
      profile: p,
      epoch,
      tick,
      position: { ...position },
      chunkKeys,
      chunkSnapshots: chunkKeys.map((key) => keyed.get(key)!),
      entities,
      inventory,
    };
  }

  /** Total number of connect transitions issued across all profiles. */
  get epochCount(): number {
    return this.epochCount_;
  }

  /** The bounded connect/disconnect history log, oldest first (copy). */
  get history(): readonly ReconnectHistoryRecord[] {
    return this.history_.map((r) => ({ ...r }));
  }

  private pushHistory(record: ReconnectHistoryRecord): void {
    this.history_.push(record);
    if (this.history_.length > this.historyLimit) {
      this.history_.shift();
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side replicated-state summary and full-state application
// ────────────────────────────────────────────────────────────────────────────

interface ClientSummary {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly inventoryStateId: number;
  readonly interest: readonly string[];
  readonly entities: readonly number[];
}

function emptySummary(profile: string, epoch: SessionEpoch): ClientSummary {
  return {
    profile,
    epoch,
    tick: 0,
    position: { x: 0, y: 0, z: 0 },
    inventoryStateId: 0,
    interest: [],
    entities: [],
  };
}

function cloneAction(action: ResyncAction): ResyncAction {
  switch (action.kind) {
    case 'reset_movement':
      return { kind: 'reset_movement', position: { ...action.position }, tick: action.tick };
    case 'reset_inventory':
      return {
        kind: 'reset_inventory',
        stateId: action.stateId,
        slots: action.slots.map((s) => (s ? { ...s } : null)),
        hotbar: action.hotbar.map((s) => (s ? { ...s } : null)),
        cursorItem: action.cursorItem ? { ...action.cursorItem } : null,
      };
    case 'clear_block_predictions':
      return { kind: 'clear_block_predictions' };
    case 'reset_chunks':
      return { kind: 'reset_chunks', keys: [...action.keys] };
    case 'reset_entities':
      return { kind: 'reset_entities', entityIds: [...action.entityIds] };
  }
}

function cloneDirective(directive: ClientResyncDirective): ClientResyncDirective {
  return { actions: directive.actions.map((a) => cloneAction(a)) };
}

/**
 * Client-side replicated-state summary tracker (235). Records what the client believes it has
 * applied (tick, position, inventory stateId, interest, entities), produces its
 * `ClientStateSignature`, and applies authoritative full-state snapshots — replacing the
 * summary wholesale and returning a `ClientResyncDirective` the caller executes against the
 * concrete reconcilers/stores. Never touches those components itself.
 */
export class ReconnectStateClient {
  private profile_: string | null = null;
  private epoch_: SessionEpoch | null = null;
  private resyncPending_ = false;
  private summary_: ClientSummary | null = null;
  private lastDirective_: ClientResyncDirective | null = null;

  /** Begin a client session: records the handshake epoch, resets the summary, marks resync pending. */
  connect(profile: string, epoch: SessionEpoch): void {
    const p = requireNonEmptyString(profile, 'profile');
    const e = requireNonNegSafeInt(epoch, 'epoch');
    this.profile_ = p;
    this.epoch_ = e;
    this.resyncPending_ = true;
    this.summary_ = emptySummary(p, e);
    this.lastDirective_ = null;
  }

  /** End the client session. Throws when no session is active. */
  disconnect(): void {
    if (this.profile_ === null) {
      fail('client has no active session');
    }
    this.profile_ = null;
    this.epoch_ = null;
    this.resyncPending_ = false;
    this.summary_ = null;
    this.lastDirective_ = null;
  }

  /** Restore the pristine pre-connect state. */
  reset(): void {
    this.profile_ = null;
    this.epoch_ = null;
    this.resyncPending_ = false;
    this.summary_ = null;
    this.lastDirective_ = null;
  }

  /** True while a full-state snapshot for the current epoch has not yet been applied. */
  get resyncPending(): boolean {
    return this.resyncPending_;
  }

  /** The last directive returned by `applyFullState` (defensive copy), or null. */
  get lastDirective(): ClientResyncDirective | null {
    return this.lastDirective_ === null ? null : cloneDirective(this.lastDirective_);
  }

  /** Number of actions in the last returned directive (0 before any application). */
  get pendingActions(): number {
    return this.lastDirective_ === null ? 0 : this.lastDirective_.actions.length;
  }

  /** Record the last server tick applied to the client state. */
  recordTick(tick: number): void {
    this.requireConnected();
    const t = requireNonNegSafeInt(tick, 'tick');
    this.summary_ = { ...this.summary_!, tick: t };
  }

  /** Record the last confirmed player position. */
  recordPosition(position: Position): void {
    this.requireConnected();
    const pos = requireFinitePosition(position, 'position');
    this.summary_ = { ...this.summary_!, position: pos };
  }

  /** Record the last applied inventory state id. */
  recordInventoryStateId(stateId: number): void {
    this.requireConnected();
    const id = requireNonNegSafeInt(stateId, 'inventoryStateId');
    this.summary_ = { ...this.summary_!, inventoryStateId: id };
  }

  /** Replace the interest chunk-key set (stored sorted and de-duplicated). */
  setInterest(keys: readonly string[]): void {
    this.requireConnected();
    if (!Array.isArray(keys)) {
      fail('interest must be an array');
    }
    const validated = keys.map((k) => requireChunkKey(k));
    const unique = [...new Set(validated)].sort();
    this.summary_ = { ...this.summary_!, interest: unique };
  }

  /** Replace the replicated entity-id set (stored sorted and de-duplicated). */
  setEntities(ids: readonly number[]): void {
    this.requireConnected();
    if (!Array.isArray(ids)) {
      fail('entities must be an array');
    }
    const validated = ids.map((id) => requireEntityId(id));
    const unique = [...new Set(validated)].sort((a, b) => a - b);
    this.summary_ = { ...this.summary_!, entities: unique };
  }

  /** The client's current replicated-state signature (defensive copy, interest/entities sorted). */
  signature(): ClientStateSignature {
    this.requireConnected();
    const s = this.summary_!;
    return {
      profile: s.profile,
      epoch: s.epoch,
      tick: s.tick,
      position: { ...s.position },
      inventoryStateId: s.inventoryStateId,
      interest: [...s.interest].sort(),
      entities: [...s.entities].sort((a, b) => a - b),
    };
  }

  /**
   * Apply an authoritative full-state snapshot for the current epoch: replaces the client
   * summary wholesale, clears `resyncPending`, and returns the `ClientResyncDirective` (fixed
   * action order: reset_movement, reset_inventory, clear_block_predictions, reset_chunks,
   * reset_entities). A snapshot with a non-current epoch throws; applying the same snapshot
   * twice is idempotent (identical summary and directive).
   */
  applyFullState(snapshot: FullStateSnapshot): ClientResyncDirective {
    this.requireConnected();
    if (typeof snapshot !== 'object' || snapshot === null) {
      fail('snapshot must be an object');
    }
    if (snapshot.epoch !== this.epoch_) {
      fail('snapshot epoch is not the current session');
    }
    if (typeof snapshot.profile !== 'string' || snapshot.profile !== this.profile_) {
      fail('snapshot profile must match the current session');
    }
    const tick = requireNonNegSafeInt(snapshot.tick, 'snapshot tick');
    const position = requireFinitePosition(snapshot.position, 'snapshot position');
    const inventory = validateInventoryWindow(snapshot.inventory);
    if (!Array.isArray(snapshot.chunkKeys)) {
      fail('snapshot chunkKeys must be an array');
    }
    if (!Array.isArray(snapshot.chunkSnapshots)) {
      fail('snapshot chunkSnapshots must be an array');
    }
    const keys = snapshot.chunkKeys.map((k) => requireChunkKey(k));
    for (let i = 1; i < keys.length; i += 1) {
      if (keys[i]! <= keys[i - 1]!) {
        fail('snapshot chunkKeys must be sorted and unique');
      }
    }
    const chunkSnapshots = snapshot.chunkSnapshots.map((c) => validateChunkSnapshot(c));
    if (keys.length !== chunkSnapshots.length) {
      fail('snapshot chunkKeys must match chunkSnapshots');
    }
    const snapshotKeySet = new Set(chunkSnapshots.map((c) => c.key));
    for (const key of keys) {
      if (!snapshotKeySet.has(key)) {
        fail(`snapshot chunk key ${key} has no matching snapshot`);
      }
    }
    if (!Array.isArray(snapshot.entities)) {
      fail('snapshot entities must be an array');
    }
    const entities = snapshot.entities.map((d) => validateEntityDescriptor(d));
    const entityIds = entities.map((d) => d.id);
    for (let i = 1; i < entityIds.length; i += 1) {
      if (entityIds[i]! <= entityIds[i - 1]!) {
        fail('snapshot entity ids must be sorted and unique');
      }
    }

    this.summary_ = {
      profile: this.profile_!,
      epoch: this.epoch_!,
      tick,
      position: { ...position },
      inventoryStateId: inventory.stateId,
      interest: keys,
      entities: entityIds,
    };
    this.resyncPending_ = false;
    const directive: ClientResyncDirective = {
      actions: [
        { kind: 'reset_movement', position: { ...position }, tick },
        {
          kind: 'reset_inventory',
          stateId: inventory.stateId,
          slots: inventory.slots,
          hotbar: inventory.hotbar,
          cursorItem: inventory.cursorItem,
        },
        { kind: 'clear_block_predictions' },
        { kind: 'reset_chunks', keys: [...keys] },
        { kind: 'reset_entities', entityIds: [...entityIds] },
      ],
    };
    this.lastDirective_ = directive;
    return cloneDirective(directive);
  }

  private requireConnected(): void {
    if (this.profile_ === null || this.epoch_ === null || this.summary_ === null) {
      fail('client is not connected');
    }
  }
}
