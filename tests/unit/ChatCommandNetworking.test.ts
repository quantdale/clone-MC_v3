import { describe, expect, it } from 'vitest';
import {
  ChatCommandRouter,
  ClientChatState,
  type ChatCommandRouterOptions,
  type ChatDelivery,
  type ChatRouteResult,
} from '../../src/simulation/ChatCommandNetworking';
import {
  createNetworkProtocol,
  decodeMessage,
  encodeMessage,
  protocolCompatibility,
  type ProtocolMessage,
} from '../../src/simulation/NetworkProtocol';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function router(options: ChatCommandRouterOptions = {}): ChatCommandRouter {
  return new ChatCommandRouter(options);
}

function register(r: ChatCommandRouter, playerId: number, permissionLevel = 2, profile = `p${playerId}`): void {
  r.registerPlayer(playerId, profile, permissionLevel);
}

function chat(
  r: ChatCommandRouter,
  playerId = 1,
  text = 'hello',
): Extract<ChatRouteResult, { kind: 'chat' }> {
  return r.submitText(playerId, text) as Extract<ChatRouteResult, { kind: 'chat' }>;
}

function command(
  r: ChatCommandRouter,
  text: string,
  playerId = 1,
): Extract<ChatRouteResult, { kind: 'command' }> {
  return r.submitText(playerId, text) as Extract<ChatRouteResult, { kind: 'command' }>;
}

function rejected(r: ChatCommandRouter, playerId: number, text: string): Extract<ChatRouteResult, { kind: 'rejected' }> {
  return r.submitText(playerId, text) as Extract<ChatRouteResult, { kind: 'rejected' }>;
}

function state(options: { localPlayerId?: number; maxLogSize?: number; maxMessageLength?: number } = {}): ClientChatState {
  return new ClientChatState(options);
}

function delivery(overrides: Partial<ChatDelivery> = {}): ChatDelivery {
  return { to: 1, kind: 'chat', seq: 1, sender: 2, text: 'hi', ...overrides };
}

describe('ChatCommandNetworking', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-1: Player Registration and Connection Context
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-1 player registration and connection context', () => {
    it('accepts text from a registered player', () => {
      const r = router();
      register(r, 1, 2);
      const result = chat(r);
      expect(result.kind).toBe('chat');
      expect(result).not.toMatchObject({ kind: 'rejected', reason: 'not_connected' });
    });

    it('rejects text from an unregistered player with not_connected', () => {
      const r = router();
      expect(rejected(r, 2, 'hello')).toEqual({ kind: 'rejected', reason: 'not_connected' });
    });

    it('rejects text from a non-safe-integer playerId as not_connected', () => {
      const r = router();
      register(r, 1);
      for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1] as number[]) {
        expect(r.submitText(bad, 'hello')).toEqual({ kind: 'rejected', reason: 'not_connected' });
      }
    });

    it('throws ChatCommand: on duplicate registration and leaves the set unchanged', () => {
      const r = router();
      register(r, 1);
      expect(() => r.registerPlayer(1, 'p1', 2)).toThrow(/^ChatCommand: player 1 is already registered/);
      expect(r.connectedCount).toBe(1);
      expect(r.isConnected(1)).toBe(true);
    });

    it('unregisters a player who is then rejected as not_connected', () => {
      const r = router();
      register(r, 1);
      expect(r.unregisterPlayer(1)).toBe(true);
      expect(r.isConnected(1)).toBe(false);
      expect(r.connectedCount).toBe(0);
      expect(rejected(r, 1, 'hello')).toEqual({ kind: 'rejected', reason: 'not_connected' });
    });

    it('unregisterPlayer returns false for an unknown player and throws on invalid ids', () => {
      const r = router();
      register(r, 1);
      expect(r.unregisterPlayer(2)).toBe(false);
      expect(() => r.unregisterPlayer(1.5)).toThrow(/^ChatCommand: playerId/);
      expect(() => r.unregisterPlayer(-1)).toThrow(/^ChatCommand: playerId/);
    });

    it('throws ChatCommand: on invalid playerId arguments', () => {
      const r = router();
      for (const bad of [-1, 1.5, Number.NaN, '1' as never]) {
        expect(() => r.registerPlayer(bad as number, 'p', 2)).toThrow(/^ChatCommand: playerId/);
      }
      expect(r.connectedCount).toBe(0);
    });

    it('throws ChatCommand: on empty or whitespace-only profile', () => {
      const r = router();
      expect(() => r.registerPlayer(1, '', 2)).toThrow(/^ChatCommand: profile/);
      expect(() => r.registerPlayer(1, '   ', 2)).toThrow(/^ChatCommand: profile/);
      expect(r.connectedCount).toBe(0);
    });

    it('throws ChatCommand: on permissionLevel outside [0,4] or non-integer', () => {
      const r = router();
      for (const bad of [-1, 5, 2.5, Number.NaN, '2' as never]) {
        expect(() => r.registerPlayer(1, 'p', bad as number)).toThrow(/^ChatCommand: permissionLevel/);
      }
      expect(r.connectedCount).toBe(0);
    });

    it('throws ChatCommand: maxPlayers limit exceeded without mutation', () => {
      const r = router({ maxPlayers: 2 });
      register(r, 1);
      register(r, 2);
      expect(() => r.registerPlayer(3, 'p3', 0)).toThrow(/^ChatCommand: maxPlayers limit exceeded/);
      expect(r.connectedCount).toBe(2);
      expect(r.isConnected(3)).toBe(false);
    });

    it('exposes connectedCount and isConnected', () => {
      const r = router();
      expect(r.connectedCount).toBe(0);
      register(r, 1, 4, 'alice');
      register(r, 2, 0, 'bob');
      expect(r.connectedCount).toBe(2);
      expect(r.isConnected(1)).toBe(true);
      expect(r.isConnected(2)).toBe(true);
      expect(r.isConnected(3)).toBe(false);
      expect(() => r.isConnected(1.5)).toThrow(/^ChatCommand: playerId/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-2: Message Input Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-2 message input validation', () => {
    it('rejects empty and whitespace-only messages with empty_message', () => {
      const r = router();
      register(r, 1);
      expect(rejected(r, 1, '')).toEqual({ kind: 'rejected', reason: 'empty_message' });
      expect(rejected(r, 1, '   ')).toEqual({ kind: 'rejected', reason: 'empty_message' });
    });

    it('rejects over-length messages with message_too_long', () => {
      const r = router({ maxMessageLength: 8 });
      register(r, 1);
      expect(rejected(r, 1, '0123456789')).toEqual({ kind: 'rejected', reason: 'message_too_long' });
      expect(r.currentSeq).toBe(0);
    });

    it('accepts a boundary-length message', () => {
      const r = router({ maxMessageLength: 5 });
      register(r, 1);
      const result = chat(r, 1, 'abcde');
      expect(result.kind).toBe('chat');
      expect(result.deliveries[0]!.text).toBe('abcde');
    });

    it('rejects non-string text as empty_message', () => {
      const r = router();
      register(r, 1);
      for (const bad of [null, undefined, 42, { text: 'x' }] as never[]) {
        expect(r.submitText(1, bad as string)).toEqual({ kind: 'rejected', reason: 'empty_message' });
      }
    });

    it('throws ChatCommand: on invalid router options', () => {
      expect(() => new ChatCommandRouter({ maxMessageLength: 0 })).toThrow(/^ChatCommand: maxMessageLength/);
      expect(() => new ChatCommandRouter({ maxMessageLength: -3 })).toThrow(/^ChatCommand: maxMessageLength/);
      expect(() => new ChatCommandRouter({ maxMessageLength: 2.5 })).toThrow(/^ChatCommand: maxMessageLength/);
      expect(() => new ChatCommandRouter({ maxPlayers: 0 })).toThrow(/^ChatCommand: maxPlayers/);
      expect(() => new ChatCommandRouter({ maxPlayers: 1.5 })).toThrow(/^ChatCommand: maxPlayers/);
      expect(() => new ChatCommandRouter(null as never)).toThrow(/^ChatCommand: options/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-3: Chat Broadcast Routing
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-3 chat broadcast routing', () => {
    it('produces exactly one self-echo delivery for a single player', () => {
      const r = router();
      register(r, 1);
      const result = chat(r, 1, 'hello');
      expect(result.kind).toBe('chat');
      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0]).toEqual({
        to: 1,
        kind: 'chat',
        seq: result.seq,
        sender: 1,
        text: 'hello',
      });
    });

    it('broadcasts to every connected player with a shared seq', () => {
      const r = router();
      register(r, 1, 2, 'a');
      register(r, 2, 0, 'b');
      register(r, 3, 1, 'c');
      const result = chat(r, 1, 'hi all');
      expect(result.kind).toBe('chat');
      expect(result.deliveries.map((d) => d.to)).toEqual([1, 2, 3]);
      for (const d of result.deliveries) {
        expect(d.kind).toBe('chat');
        expect(d.sender).toBe(1);
        expect(d.text).toBe('hi all');
        expect(d.seq).toBe(result.seq);
      }
    });

    it('excludes a disconnected player as a recipient', () => {
      const r = router();
      register(r, 1);
      register(r, 2);
      expect(r.unregisterPlayer(2)).toBe(true);
      const result = chat(r, 1, 'hi');
      expect(result.deliveries.map((d) => d.to)).toEqual([1]);
      expect(result.deliveries.some((d) => d.to === 2)).toBe(false);
    });

    it('orders deliveries by registration order deterministically', () => {
      const r = router();
      register(r, 2);
      register(r, 1);
      const result = chat(r, 2, 'yo');
      expect(result.deliveries.map((d) => d.to)).toEqual([2, 1]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-4: Command Routing and Permission Context
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-4 command routing and permission context', () => {
    it('routes an authorized command to an ok effect', () => {
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/time set 1000');
      expect(result.kind).toBe('command');
      expect(result.command.status).toBe('ok');
      if (result.command.status === 'ok') {
        expect(result.command.effect).toEqual({ kind: 'set_time', value: 1000 });
      }
    });

    it('denies a command when the sender lacks the required permission level', () => {
      const r = router();
      register(r, 1, 0);
      const result = command(r, '/gamemode creative');
      expect(result.kind).toBe('command');
      expect(result.command.status).toBe('denied');
      if (result.command.status === 'denied') {
        expect(result.command.command).toBe('gamemode');
        expect('effect' in result.command).toBe(false);
        expect(result.deliveries[0]!.text).toContain('denied');
      }
    });

    it('returns an error for an unknown command', () => {
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/nope arg');
      expect(result.kind).toBe('command');
      expect(result.command.status).toBe('error');
      if (result.command.status === 'error') {
        expect(result.command.error).toContain('unknown command');
        expect('effect' in result.command).toBe(false);
        expect(result.deliveries[0]!.text).toContain("unknown command 'nope'");
      }
    });

    it('returns an error for a command parse failure', () => {
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/time set notanumber');
      expect(result.kind).toBe('command');
      expect(result.command.status).toBe('error');
      if (result.command.status === 'error') {
        expect(result.command.error).toContain('expected integer');
        expect(result.deliveries[0]!.text.length).toBeGreaterThan(0);
      }
    });

    it('accepts commands at exactly the required permission level', () => {
      const r = router();
      register(r, 1, 2); // core commands require level 2
      const result = command(r, '/weather clear');
      expect(result.command.status).toBe('ok');
    });

    it('honors the sender permission level for command routing', () => {
      const r = router();
      register(r, 1, 0);
      register(r, 2, 2);
      expect(command(r, '/time set 0', 1).command.status).toBe('denied');
      expect(command(r, '/time set 0', 2).command.status).toBe('ok');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-5: Command Feedback Delivery
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-5 command feedback delivery', () => {
    it('yields exactly one ok feedback delivery plus the effect', () => {
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/weather clear');
      expect(result.command.status).toBe('ok');
      if (result.command.status === 'ok') {
        expect(result.command.effect.kind).toBe('set_weather');
      }
      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0]).toMatchObject({
        to: 1,
        kind: 'feedback',
        seq: result.seq,
        sender: 0,
      });
      expect(result.deliveries[0]!.text.length).toBeGreaterThan(0);
      expect(result.deliveries[0]!.text).toContain('executed');
    });

    it('yields exactly one denied feedback delivery and no effect', () => {
      const r = router();
      register(r, 1, 0);
      const result = command(r, '/give @p dirt 1');
      expect(result.command.status).toBe('denied');
      if (result.command.status === 'denied') {
        expect('effect' in result.command).toBe(false);
      }
      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0]!).toMatchObject({
        to: 1,
        kind: 'feedback',
        seq: result.seq,
        sender: 0,
      });
      expect(result.deliveries[0]!.text.length).toBeGreaterThan(0);
    });

    it('yields exactly one error feedback delivery with non-empty text', () => {
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/nope');
      expect(result.command.status).toBe('error');
      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0]!.kind).toBe('feedback');
      expect(result.deliveries[0]!.to).toBe(1);
      expect(result.deliveries[0]!.seq).toBe(result.seq);
      expect(result.deliveries[0]!.text.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Routing REQ-6: Determinism and Sequence Ordering
  // ──────────────────────────────────────────────────────────────────────────
  describe('routing REQ-6 determinism and sequence ordering', () => {
    it('assigns strictly increasing seq across chat and command messages', () => {
      const r = router();
      register(r, 1);
      const a = chat(r, 1, 'a');
      const b = command(r, '/time set 0');
      const c = chat(r, 1, 'b');
      expect(a.seq).toBe(1);
      expect(b.seq).toBe(2);
      expect(c.seq).toBe(3);
      expect(r.currentSeq).toBe(3);
    });

    it('shares one counter between chat and commands so clients can order them', () => {
      const r = router();
      register(r, 1);
      const cmd = command(r, '/time set 1000');
      const msg = chat(r, 1, 'after');
      expect(cmd.seq).toBe(1);
      expect(msg.seq).toBe(2);
      expect(msg.deliveries[0]!.seq).toBe(2);
    });

    it('does not consume a sequence number for rejected input', () => {
      const r = router();
      register(r, 1);
      expect(rejected(r, 1, '')).toEqual({ kind: 'rejected', reason: 'empty_message' });
      expect(rejected(r, 1, 'x'.repeat(300))).toEqual({ kind: 'rejected', reason: 'message_too_long' });
      expect(rejected(r, 9, 'hi')).toEqual({ kind: 'rejected', reason: 'not_connected' });
      expect(r.currentSeq).toBe(0);
      const result = chat(r, 1, 'ok');
      expect(result.seq).toBe(1);
    });

    it('produces identical results for identical input sequences on fresh routers', () => {
      const run = (): readonly ChatRouteResult[] => {
        const r = router();
        register(r, 1, 2, 'a');
        register(r, 2, 0, 'b');
        return [
          r.submitText(1, 'hello'),
          r.submitText(2, 'hi'),
          r.submitText(1, '/time set 1000'),
          r.submitText(1, '/gamemode creative'),
          r.submitText(1, '/nope'),
          r.submitText(2, ''),
          r.submitText(1, 'world'),
        ];
      };
      expect(run()).toEqual(run());
    });

    it('never reuses a sequence number across unregister/re-register cycles', () => {
      const r = router();
      register(r, 1);
      expect(chat(r, 1, 'a').seq).toBe(1);
      r.unregisterPlayer(1);
      register(r, 1);
      expect(chat(r, 1, 'b').seq).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-1: Outbound Submission
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-1 outbound submission', () => {
    it('records a pending outbound on valid submit', () => {
      const s = state();
      s.submit('hello');
      expect(s.pendingCount).toBe(1);
      expect(s.hasPending('hello')).toBe(true);
    });

    it('throws ClientChatState: on empty or whitespace-only text without changing the outbox', () => {
      const s = state();
      expect(() => s.submit('')).toThrow(/^ClientChatState:/);
      expect(() => s.submit('   ')).toThrow(/^ClientChatState:/);
      expect(() => s.submit(42 as never)).toThrow(/^ClientChatState:/);
      expect(s.pendingCount).toBe(0);
    });

    it('throws ClientChatState: on over-length text without changing the outbox', () => {
      const s = state({ maxMessageLength: 4 });
      expect(() => s.submit('abcdef')).toThrow(/^ClientChatState:/);
      expect(s.pendingCount).toBe(0);
    });

    it('tracks multiple pending outbounds in order and rejects unknown queries', () => {
      const s = state();
      s.submit('a');
      s.submit('b');
      expect(s.pendingCount).toBe(2);
      expect(s.hasPending('a')).toBe(true);
      expect(s.hasPending('b')).toBe(true);
      expect(s.hasPending('c')).toBe(false);
    });

    it('hasPending validates its argument', () => {
      const s = state();
      expect(() => s.hasPending('')).toThrow(/^ClientChatState:/);
      expect(() => s.hasPending(5 as never)).toThrow(/^ClientChatState:/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-2: Delivery Application and Deduplication
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-2 delivery application and deduplication', () => {
    it('appends a broadcast delivery as a log entry', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 2, text: 'hi' });
      expect(s.messages).toEqual([{ seq: 5, sender: 2, text: 'hi', kind: 'chat', fromSelf: false }]);
    });

    it('ignores a re-delivery of the same sequence', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 2, text: 'hi' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 2, text: 'hi' });
      expect(s.messages).toHaveLength(1);
      expect(s.messages[0]!.seq).toBe(5);
    });

    it('ignores a same-sequence re-delivery even with different content', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 2, text: 'hi' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 3, text: 'different' });
      expect(s.messages).toEqual([{ seq: 5, sender: 2, text: 'hi', kind: 'chat', fromSelf: false }]);
    });

    it('stores out-of-order deliveries in ascending seq order', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 9, sender: 2, text: 'nine' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 3, sender: 2, text: 'three' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 7, sender: 2, text: 'seven' });
      expect(s.messages.map((m) => m.seq)).toEqual([3, 7, 9]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-3: Pending Outbound Confirmation
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-3 pending outbound confirmation', () => {
    it('confirms a pending outbound on a matching self-echo', () => {
      const s = state();
      s.submit('hello');
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'hello' });
      expect(s.pendingCount).toBe(0);
      expect(s.hasPending('hello')).toBe(false);
      expect(s.messages[0]).toMatchObject({ seq: 1, kind: 'chat', text: 'hello', fromSelf: true });
    });

    it('does not confirm a pending outbound from another player', () => {
      const s = state();
      s.submit('hello');
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'hello' });
      expect(s.pendingCount).toBe(1);
      expect(s.messages[0]).toMatchObject({ sender: 2, fromSelf: false });
    });

    it('matches duplicate pending texts in FIFO order', () => {
      const s = state();
      s.submit('hi');
      s.submit('hi');
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'hi' });
      expect(s.pendingCount).toBe(1);
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 1, text: 'hi' });
      expect(s.pendingCount).toBe(0);
    });

    it('leaves fromSelf false when a self-sent echo has no pending outbound', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'never-submitted' });
      expect(s.pendingCount).toBe(0);
      expect(s.messages[0]!.fromSelf).toBe(false);
    });

    it('uses the configured localPlayerId for self-echo detection', () => {
      const s = state({ localPlayerId: 5 });
      s.submit('hello');
      s.applyDelivery({ to: 5, kind: 'chat', seq: 1, sender: 5, text: 'hello' });
      expect(s.pendingCount).toBe(0);
      expect(s.messages[0]!.fromSelf).toBe(true);
    });

    it('confirms only the matching text, not other pending texts', () => {
      const s = state();
      s.submit('one');
      s.submit('two');
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'two' });
      expect(s.pendingCount).toBe(1);
      expect(s.hasPending('one')).toBe(true);
      expect(s.hasPending('two')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-4: Feedback Application
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-4 feedback application', () => {
    it('appends command feedback without a pending match', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'feedback', seq: 4, sender: 0, text: 'denied' });
      expect(s.messages).toEqual([{ seq: 4, sender: 0, text: 'denied', kind: 'feedback', fromSelf: false }]);
      expect(s.pendingCount).toBe(0);
    });

    it('does not confirm pending outbounds when feedback arrives', () => {
      const s = state();
      s.submit('/time set 1000');
      s.applyDelivery({ to: 1, kind: 'feedback', seq: 1, sender: 0, text: "command 'time' executed" });
      expect(s.pendingCount).toBe(1);
      expect(s.messages[0]!.fromSelf).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-5: Bounded Log
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-5 bounded log', () => {
    it('drops the oldest entry when the log exceeds maxLogSize', () => {
      const s = state({ maxLogSize: 2 });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'one' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'two' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 3, sender: 2, text: 'three' });
      expect(s.messages.map((m) => m.seq)).toEqual([2, 3]);
    });

    it('keeps only the newest entry at maxLogSize 1', () => {
      const s = state({ maxLogSize: 1 });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'one' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'two' });
      expect(s.messages.map((m) => m.seq)).toEqual([2]);
    });

    it('handles re-application of a dropped seq consistently (dedupe is against the live log)', () => {
      const s = state({ maxLogSize: 2 });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'one' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'two' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 3, sender: 2, text: 'three' });
      // seq 1 was dropped; re-applying it re-inserts the entry, which the bound immediately drops again.
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'one-again' });
      expect(s.messages.map((m) => m.seq)).toEqual([2, 3]);
      expect(s.messages[0]!.text).toBe('two');
    });

    it('drops pending-confirmed entries by seq like any other entry', () => {
      const s = state({ maxLogSize: 2 });
      s.submit('hello');
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'hello' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'x' });
      s.applyDelivery({ to: 1, kind: 'chat', seq: 3, sender: 2, text: 'y' });
      expect(s.messages.map((m) => m.seq)).toEqual([2, 3]);
      expect(s.pendingCount).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Client REQ-6: Validation and Determinism
  // ──────────────────────────────────────────────────────────────────────────
  describe('client REQ-6 validation and determinism', () => {
    it('throws ClientChatState: on invalid delivery fields without corrupting the log', () => {
      const s = state();
      expect(() => s.applyDelivery(delivery({ seq: 1.5 }))).toThrow(/^ClientChatState: seq/);
      expect(() => s.applyDelivery(delivery({ seq: -1 }))).toThrow(/^ClientChatState: seq/);
      expect(() => s.applyDelivery(delivery({ seq: Number.NaN }))).toThrow(/^ClientChatState: seq/);
      expect(() => s.applyDelivery(delivery({ sender: -1 }))).toThrow(/^ClientChatState: sender/);
      expect(() => s.applyDelivery(delivery({ sender: 2.5 }))).toThrow(/^ClientChatState: sender/);
      expect(() => s.applyDelivery(delivery({ to: -2 }))).toThrow(/^ClientChatState: to/);
      expect(() => s.applyDelivery(delivery({ kind: 'broadcast' as never }))).toThrow(/^ClientChatState: kind/);
      expect(() => s.applyDelivery(delivery({ text: '' }))).toThrow(/^ClientChatState: text/);
      expect(() => s.applyDelivery(delivery({ text: 7 as never }))).toThrow(/^ClientChatState: text/);
      expect(() => s.applyDelivery(null as never)).toThrow(/^ClientChatState: delivery/);
      expect(s.messages).toHaveLength(0);
      expect(s.pendingCount).toBe(0);
    });

    it('throws ClientChatState: on invalid constructor options', () => {
      expect(() => new ClientChatState({ maxLogSize: 0 })).toThrow(/^ClientChatState: maxLogSize/);
      expect(() => new ClientChatState({ maxLogSize: -3 })).toThrow(/^ClientChatState: maxLogSize/);
      expect(() => new ClientChatState({ maxLogSize: 2.5 })).toThrow(/^ClientChatState: maxLogSize/);
      expect(() => new ClientChatState({ maxMessageLength: 0 })).toThrow(/^ClientChatState: maxMessageLength/);
      expect(() => new ClientChatState({ localPlayerId: -1 })).toThrow(/^ClientChatState: localPlayerId/);
      expect(() => new ClientChatState({ localPlayerId: 1.5 })).toThrow(/^ClientChatState: localPlayerId/);
      expect(() => new ClientChatState(null as never)).toThrow(/^ClientChatState: options/);
    });

    it('remains usable after failed deliveries', () => {
      const s = state();
      expect(() => s.applyDelivery(delivery({ seq: Number.NaN }))).toThrow();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'ok' });
      expect(s.messages).toHaveLength(1);
    });

    it('produces identical states for identical delivery sequences', () => {
      const run = (): { messages: unknown; pending: number } => {
        const s = state({ localPlayerId: 1, maxLogSize: 3 });
        s.submit('hello');
        s.submit('hi');
        s.applyDelivery({ to: 1, kind: 'chat', seq: 9, sender: 2, text: 'x' });
        s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'hello' });
        s.applyDelivery({ to: 1, kind: 'feedback', seq: 2, sender: 0, text: 'denied' });
        s.applyDelivery({ to: 1, kind: 'chat', seq: 3, sender: 1, text: 'hi' });
        return { messages: s.messages, pending: s.pendingCount };
      };
      expect(run()).toEqual(run());
    });

    it('returns snapshot copies that cannot corrupt internal state', () => {
      const s = state();
      s.applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 2, text: 'hi' });
      const snapshot = s.messages;
      (snapshot[0] as { text: string }).text = 'corrupted';
      expect(s.messages[0]!.text).toBe('hi');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Wire message contract (223 codec round-trip)
  // ──────────────────────────────────────────────────────────────────────────
  describe('wire message contract via createNetworkProtocol', () => {
    // Test-local message ids: per the 232 convention the modules do not allocate numeric
    // message ids in production code; the wiring builds the protocol registry, and tests
    // prove the name/field contract round-trips through 223's codecs.
    const CHAT_MESSAGES: readonly ProtocolMessage[] = [
      {
        id: 40,
        name: 'chat_send',
        fields: [
          { name: 'sender', type: 'int' },
          { name: 'text', type: 'string' },
        ],
      },
      {
        id: 41,
        name: 'chat_broadcast',
        fields: [
          { name: 'seq', type: 'int' },
          { name: 'sender', type: 'int' },
          { name: 'text', type: 'string' },
        ],
      },
      {
        id: 42,
        name: 'chat_feedback',
        fields: [
          { name: 'seq', type: 'int' },
          { name: 'text', type: 'string' },
        ],
      },
    ];

    it('round-trips chat_send client-to-server payloads', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      const envelope = encodeMessage(proto, 'chat_send', { sender: 1, text: 'hello' });
      expect(envelope).toEqual({ messageId: 40, values: [1, 'hello'] });
      expect(decodeMessage(proto, envelope!)).toEqual({
        name: 'chat_send',
        values: { sender: 1, text: 'hello' },
      });
    });

    it('round-trips chat_broadcast payloads produced by router deliveries', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      const r = router();
      register(r, 1);
      register(r, 2);
      const result = chat(r, 1, 'hi all');
      for (const d of result.deliveries) {
        const envelope = encodeMessage(proto, 'chat_broadcast', {
          seq: d.seq,
          sender: d.sender,
          text: d.text,
        });
        expect(decodeMessage(proto, envelope!)).toEqual({
          name: 'chat_broadcast',
          values: { seq: d.seq, sender: 1, text: 'hi all' },
        });
      }
    });

    it('round-trips chat_feedback payloads produced by command feedback deliveries', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      const r = router();
      register(r, 1, 2);
      const result = command(r, '/weather clear');
      const d = result.deliveries[0]!;
      const envelope = encodeMessage(proto, 'chat_feedback', { seq: d.seq, text: d.text });
      expect(decodeMessage(proto, envelope!)).toEqual({
        name: 'chat_feedback',
        values: { seq: d.seq, text: d.text },
      });
    });

    it('rejects wrong field counts and types with null', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      expect(encodeMessage(proto, 'chat_send', { sender: 1 })).toBeNull();
      expect(encodeMessage(proto, 'chat_send', { sender: 1, text: 7 })).toBeNull();
      expect(encodeMessage(proto, 'chat_send', { sender: 1, text: 'x', extra: 1 })).toBeNull();
      expect(encodeMessage(proto, 'nope', {})).toBeNull();
      expect(decodeMessage(proto, { messageId: 999, values: [] })).toBeNull();
    });

    it('reports identical chat protocols as compatible and missing messages as incompatible', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      expect(protocolCompatibility(proto, proto)).toEqual({ compatible: true });
      const missing = createNetworkProtocol(1, CHAT_MESSAGES.slice(0, 2));
      expect(protocolCompatibility(proto, missing)).toMatchObject({ compatible: false });
    });

    it('accepts a decoded chat_send payload end-to-end through the router', () => {
      const proto = createNetworkProtocol(1, CHAT_MESSAGES);
      const r = router();
      register(r, 1, 2);
      const envelope = encodeMessage(proto, 'chat_send', { sender: 1, text: '/time set 6000' });
      const decoded = decodeMessage(proto, envelope!);
      expect(decoded!.name).toBe('chat_send');
      const result = r.submitText(decoded!.values.sender as number, decoded!.values.text as string);
      expect(result.kind).toBe('command');
      if (result.kind === 'command') {
        expect(result.command.status).toBe('ok');
        if (result.command.status === 'ok') {
          expect(result.command.effect).toEqual({ kind: 'set_time', value: 6000 });
        }
      }
    });
  });
});
