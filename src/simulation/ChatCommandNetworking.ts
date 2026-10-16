/**
 * Pure headless chat and command networking framework (233).
 *
 * Server-side routing of a connected player's text: `ChatCommandRouter` tracks connected
 * players (`playerId -> { profile, permissionLevel }` with vanilla operator levels 0-4),
 * validates inbound text, broadcasts non-`/` messages as chat deliveries to every connected
 * player with a strict monotonic server-assigned `seq`, and routes `/`-prefixed messages
 * through 191's `executeCoreCommand` under the sender's permission level, producing exactly
 * one feedback delivery to the sender plus the structured `ChatCommandResult` (ok/denied/error)
 * for the wiring to apply. Client-side message state (`ClientChatState`) records pending
 * outbound messages, applies incoming deliveries exactly once (dedupe by `seq`), confirms
 * pending outbounds from matching self-echoes in FIFO order, and maintains a bounded,
 * seq-ordered message log. Zero DOM, THREE, or transport dependencies; no `src/player`
 * imports — consistent with the 230/231/232 networking pattern.
 */

import { executeCoreCommand, type CommandEffect } from './CoreCommands';
import { splitCommand } from './CommandParser';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type ChatDeliveryKind = 'chat' | 'feedback';

/** A per-recipient delivery the wiring must transmit. */
export interface ChatDelivery {
  readonly to: number; // recipient playerId (target)
  readonly kind: ChatDeliveryKind;
  readonly seq: number; // server-assigned message sequence (strict monotonic)
  readonly sender: number; // originating playerId; 0 for system/command feedback
  readonly text: string; // already length-validated message text
}

/** Outcome of routing a `/`-prefixed message through the command system (191). */
export type ChatCommandResult =
  | { readonly status: 'ok'; readonly effect: CommandEffect }
  | { readonly status: 'denied'; readonly command: string }
  | { readonly status: 'error'; readonly error: string };

export type ChatRejectReason = 'not_connected' | 'empty_message' | 'message_too_long';

/** Full server result for one submitted text. */
export type ChatRouteResult =
  | { readonly kind: 'chat'; readonly seq: number; readonly deliveries: readonly ChatDelivery[] }
  | {
      readonly kind: 'command';
      readonly seq: number;
      readonly command: ChatCommandResult; // structured outcome; effect present iff status 'ok'
      readonly deliveries: readonly ChatDelivery[]; // exactly one feedback to the sender
    }
  | { readonly kind: 'rejected'; readonly reason: ChatRejectReason };

export interface ChatCommandRouterOptions {
  /** Max chat/command text length in characters (default 256). */
  readonly maxMessageLength?: number;
  /** Max connected players (default 64). */
  readonly maxPlayers?: number;
}

/** A connected player's routing context (no world/transport coupling). */
export interface PlayerRegistration {
  readonly profile: string;
  readonly permissionLevel: number;
}

/** One client-side log record. */
export interface ChatEntry {
  readonly seq: number;
  readonly sender: number; // originating playerId, or 0 for system feedback
  readonly text: string;
  readonly kind: ChatDeliveryKind;
  readonly fromSelf: boolean; // true when this entry echoes one of the client's own sends
}

export interface ClientChatStateOptions {
  /** The local player's id; chat deliveries with this `sender` are candidate self-echoes (default 1). */
  readonly localPlayerId?: number;
  /** Log cap; the oldest entry is dropped when exceeded (default 100). */
  readonly maxLogSize?: number;
  /** Outbound text cap in characters, mirroring the router default (default 256). */
  readonly maxMessageLength?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal validation helpers
// ────────────────────────────────────────────────────────────────────────────

function requireSafeNonNegInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`ChatCommand: ${label} must be a non-negative safe integer`);
  }
  return v;
}

function requirePositiveInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`ChatCommand: ${label} must be a positive integer`);
  }
  return v;
}

function requireNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`ChatCommand: ${label} must be a non-empty string`);
  }
  return v;
}

// ────────────────────────────────────────────────────────────────────────────
// Server-side router
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-authoritative chat/command router: owns player registration with vanilla operator
 * permission levels (0-4), validates inbound text, assigns a strict monotonic `seq` per
 * accepted message, and returns complete deterministic `ChatDelivery` sets plus the
 * structured command result. The wiring's only jobs are to feed decoded `chat_send` text
 * into `submitText`, apply a returned `ok` effect to the authoritative world, and transmit
 * each delivery to its `to` recipient.
 */
export class ChatCommandRouter {
  private readonly maxMessageLength: number;
  private readonly maxPlayers: number;
  private readonly players = new Map<number, PlayerRegistration>();
  private seqCounter = 0;

  constructor(options: ChatCommandRouterOptions = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('ChatCommand: options must be an object');
    }
    this.maxMessageLength = requirePositiveInt(options.maxMessageLength ?? 256, 'maxMessageLength');
    this.maxPlayers = requirePositiveInt(options.maxPlayers ?? 64, 'maxPlayers');
  }

  /** Number of currently connected players. */
  get connectedCount(): number {
    return this.players.size;
  }

  /** The last assigned message sequence (0 before any accepted message). */
  get currentSeq(): number {
    return this.seqCounter;
  }

  /** Whether `playerId` is currently registered. */
  isConnected(playerId: number): boolean {
    return this.players.has(requireSafeNonNegInt(playerId, 'playerId'));
  }

  /**
   * Register a connected player. Throws `ChatCommand: <detail>` before any state change on
   * invalid arguments, duplicate registration, or a full player set.
   */
  registerPlayer(playerId: number, profile: string, permissionLevel: number): void {
    const pid = requireSafeNonNegInt(playerId, 'playerId');
    const prof = requireNonEmptyString(profile, 'profile');
    if (typeof permissionLevel !== 'number' || !Number.isInteger(permissionLevel) || permissionLevel < 0 || permissionLevel > 4) {
      throw new Error('ChatCommand: permissionLevel must be an integer in [0,4]');
    }
    if (this.players.has(pid)) {
      throw new Error(`ChatCommand: player ${pid} is already registered`);
    }
    if (this.players.size >= this.maxPlayers) {
      throw new Error(`ChatCommand: maxPlayers limit exceeded (${this.maxPlayers})`);
    }
    this.players.set(pid, { profile: prof, permissionLevel });
  }

  /** Remove a connected player; returns true when the player was registered and removed. */
  unregisterPlayer(playerId: number): boolean {
    const pid = requireSafeNonNegInt(playerId, 'playerId');
    return this.players.delete(pid);
  }

  /**
   * Route one text message from a connected player: validate sender/text, assign the next
   * `seq`, and dispatch to chat broadcast or `/`-command routing. Sender/size/text failures
   * are returned as `{ kind: 'rejected', reason }` — never thrown; rejected input consumes no
   * `seq`.
   */
  submitText(playerId: number, text: string): ChatRouteResult {
    if (typeof playerId !== 'number' || !Number.isSafeInteger(playerId) || playerId < 0 || !this.players.has(playerId)) {
      return { kind: 'rejected', reason: 'not_connected' };
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { kind: 'rejected', reason: 'empty_message' };
    }
    if (text.length > this.maxMessageLength) {
      return { kind: 'rejected', reason: 'message_too_long' };
    }

    const seq = ++this.seqCounter;
    if (text.startsWith('/')) {
      return this.routeCommand(playerId, text, seq);
    }
    return this.routeChat(playerId, text, seq);
  }

  private routeChat(playerId: number, text: string, seq: number): ChatRouteResult {
    const deliveries: ChatDelivery[] = [];
    for (const to of this.players.keys()) {
      deliveries.push({ to, kind: 'chat', seq, sender: playerId, text });
    }
    return { kind: 'chat', seq, deliveries };
  }

  private routeCommand(playerId: number, text: string, seq: number): ChatRouteResult {
    const registration = this.players.get(playerId)!;
    const result = executeCoreCommand(text, registration.permissionLevel);
    const name = splitCommand(text)?.name ?? 'command';
    let feedback: string;
    if (result.status === 'ok') {
      feedback = `command '${name}' executed`;
    } else if (result.status === 'denied') {
      feedback = `command '${result.command}' denied: insufficient permission level`;
    } else {
      feedback = `command error: ${result.error}`;
    }
    const delivery: ChatDelivery = { to: playerId, kind: 'feedback', seq, sender: 0, text: feedback };
    return { kind: 'command', seq, command: result, deliveries: [delivery] };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Client-side message state
// ────────────────────────────────────────────────────────────────────────────

function clientRequireSafeNonNegInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`ClientChatState: ${label} must be a non-negative safe integer`);
  }
  return v;
}

function clientRequirePositiveInt(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`ClientChatState: ${label} must be a positive integer`);
  }
  return v;
}

/**
 * Client-side chat/command message state: a FIFO outbox of pending outbound texts and a
 * bounded, ascending-`seq` message log. Deliveries are applied exactly once (dedupe by `seq`);
 * a `kind: 'chat'` delivery whose `sender` is the local player confirms the oldest pending
 * outbound with matching text (FIFO); `kind: 'feedback'` deliveries are appended without a
 * pending match. Pure and headless-safe.
 */
export class ClientChatState {
  private readonly localPlayerId: number;
  private readonly maxLogSize: number;
  private readonly maxMessageLength: number;
  private readonly entries: ChatEntry[] = [];
  private readonly pending: string[] = [];

  constructor(options: ClientChatStateOptions = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new Error('ClientChatState: options must be an object');
    }
    this.localPlayerId = clientRequireSafeNonNegInt(options.localPlayerId ?? 1, 'localPlayerId');
    this.maxLogSize = clientRequirePositiveInt(options.maxLogSize ?? 100, 'maxLogSize');
    this.maxMessageLength = clientRequirePositiveInt(options.maxMessageLength ?? 256, 'maxMessageLength');
  }

  /** Bounded, seq-ordered snapshot of the received-message log. */
  get messages(): readonly ChatEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /** Number of outbound messages awaiting self-echo confirmation. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Whether a specific outbound text is still pending. */
  hasPending(text: string): boolean {
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('ClientChatState: text must be a non-empty string');
    }
    return this.pending.includes(text);
  }

  /** Record a local outbound message. Throws `ClientChatState: <detail>` before any mutation on invalid text. */
  submit(text: string): void {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('ClientChatState: text must be a non-empty string');
    }
    if (text.length > this.maxMessageLength) {
      throw new Error(`ClientChatState: text exceeds maxMessageLength (${this.maxMessageLength})`);
    }
    this.pending.push(text);
  }

  /**
   * Apply an incoming server delivery: validate fields, ignore a `seq` already present
   * (exact-once), confirm the FIFO-matching pending outbound on a local self-echo, insert the
   * entry in ascending `seq` order, and drop the oldest entry when `maxLogSize` is exceeded.
   */
  applyDelivery(delivery: ChatDelivery): void {
    if (typeof delivery !== 'object' || delivery === null) {
      throw new Error('ClientChatState: delivery must be an object');
    }
    clientRequireSafeNonNegInt(delivery.to, 'to');
    const seq = clientRequireSafeNonNegInt(delivery.seq, 'seq');
    const sender = clientRequireSafeNonNegInt(delivery.sender, 'sender');
    if (delivery.kind !== 'chat' && delivery.kind !== 'feedback') {
      throw new Error("ClientChatState: kind must be 'chat' or 'feedback'");
    }
    if (typeof delivery.text !== 'string' || delivery.text.length === 0) {
      throw new Error('ClientChatState: text must be a non-empty string');
    }

    if (this.entries.some((e) => e.seq === seq)) {
      return; // exact-once: already applied
    }

    let fromSelf = false;
    if (delivery.kind === 'chat' && sender === this.localPlayerId) {
      const pendingIndex = this.pending.indexOf(delivery.text);
      if (pendingIndex !== -1) {
        this.pending.splice(pendingIndex, 1);
        fromSelf = true;
      }
    }

    const entry: ChatEntry = { seq, sender, text: delivery.text, kind: delivery.kind, fromSelf };
    let insertAt = this.entries.length;
    while (insertAt > 0 && this.entries[insertAt - 1]!.seq > seq) {
      insertAt -= 1;
    }
    this.entries.splice(insertAt, 0, entry);
    if (this.entries.length > this.maxLogSize) {
      this.entries.shift();
    }
  }
}
