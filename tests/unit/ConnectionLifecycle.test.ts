import { describe, it, expect } from 'vitest';
import {
  ConnectionLifecycle,
  type ConnectionLifecycleOptions,
} from '../../src/simulation/ConnectionLifecycle';

/** Build a machine through the connected state at `at` ms. */
function connectedAt(at: number, opts: ConnectionLifecycleOptions = {}): ConnectionLifecycle {
  const c = new ConnectionLifecycle(opts);
  c.update(at);
  c.connect('alice');
  c.connected();
  c.handshakeAccepted();
  return c;
}

describe('ConnectionLifecycle', () => {
  describe('construction', () => {
    it('constructs pristine: disconnected, no profile/reason, zero keepalives, empty history', () => {
      const c = new ConnectionLifecycle();
      expect(c.state).toBe('disconnected');
      expect(c.profile).toBeNull();
      expect(c.reason).toBeNull();
      expect(c.keepAliveCount).toBe(0);
      expect(c.history).toEqual([]);
    });

    it('rejects non-positive or non-finite durations', () => {
      expect(() => new ConnectionLifecycle({ connectTimeoutMs: 0 })).toThrow(
        'ConnectionLifecycle: connectTimeoutMs must be a positive finite number',
      );
      expect(() => new ConnectionLifecycle({ handshakeTimeoutMs: -5 })).toThrow(
        'ConnectionLifecycle: handshakeTimeoutMs must be a positive finite number',
      );
      expect(() => new ConnectionLifecycle({ keepAliveTimeoutMs: Number.NaN })).toThrow(
        'ConnectionLifecycle: keepAliveTimeoutMs must be a positive finite number',
      );
    });

    it('rejects non-positive or non-integer history limits', () => {
      expect(() => new ConnectionLifecycle({ historyLimit: 0 })).toThrow(
        'ConnectionLifecycle: historyLimit must be a positive integer',
      );
      expect(() => new ConnectionLifecycle({ historyLimit: 2.5 })).toThrow(
        'ConnectionLifecycle: historyLimit must be a positive integer',
      );
    });
  });

  describe('happy path', () => {
    it('walks disconnected -> connecting -> handshaking -> connected with history records', () => {
      const c = new ConnectionLifecycle();
      c.update(1000);
      c.connect('alice');
      expect(c.state).toBe('connecting');
      expect(c.profile).toBe('alice');
      c.connected();
      expect(c.state).toBe('handshaking');
      c.handshakeAccepted();
      expect(c.state).toBe('connected');
      expect(c.profile).toBe('alice');
      expect(c.keepAliveCount).toBe(0);
      const history = c.history;
      expect(history.length).toBe(3);
      expect(history.map((r) => r.from)).toEqual([
        'disconnected',
        'connecting',
        'handshaking',
      ]);
      expect(history.map((r) => r.to)).toEqual(['connecting', 'handshaking', 'connected']);
      expect(history.every((r) => r.at === 1000)).toBe(true);
    });

    it('updates the profile when handshakeAccepted provides one', () => {
      const c = new ConnectionLifecycle();
      c.connect('alice');
      c.connected();
      c.handshakeAccepted('bob');
      expect(c.profile).toBe('bob');
      expect(c.state).toBe('connected');
    });

    it('records at 0 for transitions driven before any update', () => {
      const c = new ConnectionLifecycle();
      c.connect();
      c.connected();
      expect(c.history.every((r) => r.at === 0)).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects connect from any active state without changing state', () => {
      const c = new ConnectionLifecycle();
      c.connect('alice');
      expect(() => c.connect('bob')).toThrow(
        'ConnectionLifecycle: cannot connect from connecting',
      );
      expect(c.state).toBe('connecting');
      expect(c.profile).toBe('alice');
    });

    it('rejects keepalive before connected', () => {
      const c = new ConnectionLifecycle();
      c.connect();
      c.connected();
      expect(() => c.keepAliveReceived()).toThrow(
        'ConnectionLifecycle: cannot keepAliveReceived from handshaking',
      );
      expect(c.keepAliveCount).toBe(0);
    });

    it('rejects handshake events before the handshake phase', () => {
      const c = new ConnectionLifecycle();
      c.connect();
      expect(() => c.handshakeAccepted()).toThrow(
        'ConnectionLifecycle: cannot handshakeAccepted from connecting',
      );
      expect(() => c.handshakeRejected('no')).toThrow(
        'ConnectionLifecycle: cannot handshakeRejected from connecting',
      );
      expect(c.state).toBe('connecting');
    });

    it('rejects connected() from disconnected', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.connected()).toThrow(
        'ConnectionLifecycle: cannot connected from disconnected',
      );
    });

    it('rejects disconnect from disconnected and from disconnecting', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.disconnect()).toThrow(
        'ConnectionLifecycle: cannot disconnect from disconnected',
      );
      c.connect();
      c.disconnect();
      expect(() => c.disconnect()).toThrow(
        'ConnectionLifecycle: cannot disconnect from disconnecting',
      );
    });

    it('rejects disconnectComplete before disconnecting', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.disconnectComplete()).toThrow(
        'ConnectionLifecycle: cannot disconnectComplete from disconnected',
      );
    });

    it('rejects remoteDisconnect from disconnected', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.remoteDisconnect('x')).toThrow(
        'ConnectionLifecycle: cannot remoteDisconnect from disconnected',
      );
    });

    it('rejects empty profile and reason strings', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.connect('')).toThrow(
        'ConnectionLifecycle: profile must be a non-empty string',
      );
      c.connect('alice');
      c.connected();
      expect(() => c.handshakeRejected('')).toThrow(
        'ConnectionLifecycle: reason must be a non-empty string',
      );
      expect(c.state).toBe('handshaking');
      c.handshakeAccepted();
      expect(() => c.remoteDisconnect('')).toThrow(
        'ConnectionLifecycle: reason must be a non-empty string',
      );
      expect(c.state).toBe('connected');
    });

    it('failed events leave history, reason, and count untouched', () => {
      const c = new ConnectionLifecycle();
      c.connect('alice');
      const before = c.history.length;
      expect(() => c.keepAliveReceived()).toThrow();
      expect(c.history.length).toBe(before);
      expect(c.keepAliveCount).toBe(0);
      expect(c.reason).toBeNull();
    });
  });

  describe('disconnects', () => {
    it('graceful disconnect passes through disconnecting and completes with reason', () => {
      const c = connectedAt(1000);
      c.disconnect();
      expect(c.state).toBe('disconnecting');
      expect(c.reason).toBe('local disconnect');
      c.disconnectComplete();
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('disconnected');
      expect(c.profile).toBeNull();
    });

    it('remoteDisconnect works from every active state', () => {
      const cases: Array<[string, () => ConnectionLifecycle]> = [
        [
          'connecting',
          () => {
            const c = new ConnectionLifecycle();
            c.connect();
            return c;
          },
        ],
        [
          'handshaking',
          () => {
            const c = new ConnectionLifecycle();
            c.connect();
            c.connected();
            return c;
          },
        ],
        ['connected', () => connectedAt(1000)],
      ];
      for (const [label, build] of cases) {
        const c = build();
        expect(c.state).toBe(label);
        c.remoteDisconnect('server shutdown');
        expect(c.state).toBe('disconnected');
        expect(c.reason).toBe('server shutdown');
      }
    });

    it('remoteDisconnect from disconnecting also completes', () => {
      const c = connectedAt(1000);
      c.disconnect();
      c.remoteDisconnect('server shutdown');
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('server shutdown');
    });

    it('reconnects after any disconnect and resets the keepalive count', () => {
      const c = connectedAt(1000);
      c.keepAliveReceived();
      c.keepAliveReceived();
      expect(c.keepAliveCount).toBe(2);
      c.remoteDisconnect('lost');
      expect(c.state).toBe('disconnected');
      c.connect('alice');
      expect(c.state).toBe('connecting');
      expect(c.keepAliveCount).toBe(0);
      expect(c.profile).toBe('alice');
    });
  });

  describe('keepalive', () => {
    it('refreshes the keepalive deadline and increments the counter only in connected', () => {
      const c = connectedAt(1000, { keepAliveTimeoutMs: 100 });
      c.keepAliveReceived();
      expect(c.keepAliveCount).toBe(1);
      c.update(1099);
      expect(c.state).toBe('connected');
      c.update(1100);
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('keepalive timeout');
    });
  });

  describe('timeouts', () => {
    it('expires connecting with connect timeout at the inclusive boundary', () => {
      const c = new ConnectionLifecycle({ connectTimeoutMs: 100 });
      c.update(1000);
      c.connect();
      expect(c.state).toBe('connecting');
      c.update(1099);
      expect(c.state).toBe('connecting');
      c.update(1100);
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('connect timeout');
    });

    it('expires handshaking with handshake timeout', () => {
      const c = new ConnectionLifecycle({ handshakeTimeoutMs: 100 });
      c.update(1000);
      c.connect();
      c.connected();
      c.update(1100);
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('handshake timeout');
    });

    it('expires connected with keepalive timeout at the deadline', () => {
      const c = connectedAt(1000, { keepAliveTimeoutMs: 100 });
      c.update(1100);
      expect(c.state).toBe('disconnected');
      expect(c.reason).toBe('keepalive timeout');
    });

    it('ignores non-finite and backward timestamps', () => {
      const c = connectedAt(1000, { keepAliveTimeoutMs: 100 });
      const historyBefore = c.history.length;
      c.update(Number.NaN);
      c.update(Number.POSITIVE_INFINITY);
      c.update(900);
      expect(c.state).toBe('connected');
      expect(c.history.length).toBe(historyBefore);
      // Forward time still expires normally afterwards.
      c.update(1100);
      expect(c.state).toBe('disconnected');
    });

    it('does not expire while disconnecting or disconnected', () => {
      const c = connectedAt(1000, { keepAliveTimeoutMs: 100 });
      c.disconnect();
      c.update(5000);
      expect(c.state).toBe('disconnecting');
      c.remoteDisconnect('server shutdown');
      c.update(5000);
      expect(c.state).toBe('disconnected');
    });
  });

  describe('reset and history', () => {
    it('reset restores the pristine state', () => {
      const c = connectedAt(1000);
      c.keepAliveReceived();
      c.disconnect();
      c.reset();
      expect(c.state).toBe('disconnected');
      expect(c.profile).toBeNull();
      expect(c.reason).toBeNull();
      expect(c.keepAliveCount).toBe(0);
      expect(c.history).toEqual([]);
    });

    it('drops the oldest records beyond the history limit', () => {
      const c = new ConnectionLifecycle({ historyLimit: 3 });
      c.connect();
      c.connected();
      c.handshakeAccepted();
      c.disconnect();
      c.disconnectComplete();
      const history = c.history;
      expect(history.length).toBe(3);
      expect(history[0]).toMatchObject({ from: 'handshaking', to: 'connected' });
      expect(history[2]).toMatchObject({ from: 'disconnecting', to: 'disconnected' });
    });

    it('history returns a snapshot that external mutation cannot affect', () => {
      const c = new ConnectionLifecycle();
      c.connect();
      c.connected();
      const history = c.history as unknown as { pop(): unknown };
      history.pop();
      expect(c.history.length).toBe(2);
    });
  });

  describe('determinism', () => {
    it('identical schedules with identical scripted time produce identical observable state', () => {
      const run = (): ConnectionLifecycle => {
        const c = new ConnectionLifecycle({
          connectTimeoutMs: 100,
          handshakeTimeoutMs: 100,
          keepAliveTimeoutMs: 100,
        });
        c.update(1000);
        c.connect('alice');
        c.connected();
        c.handshakeAccepted();
        c.keepAliveReceived();
        c.keepAliveReceived();
        c.update(1050);
        c.disconnect();
        c.disconnectComplete();
        c.connect();
        c.remoteDisconnect('lost');
        return c;
      };
      const a = run();
      const b = run();
      expect(b.state).toBe(a.state);
      expect(b.reason).toBe(a.reason);
      expect(b.profile).toBe(a.profile);
      expect(b.keepAliveCount).toBe(a.keepAliveCount);
      expect(b.history).toEqual(a.history);
    });
  });

  describe('adversarial integrity (237)', () => {
    it('bounds the transition history to historyLimit', () => {
      const c = new ConnectionLifecycle({ historyLimit: 3 });
      c.update(100);
      c.connect('a');
      c.connected();
      c.handshakeAccepted();
      c.disconnect();
      c.disconnectComplete();
      expect(c.history.length).toBe(3);
      expect(c.state).toBe('disconnected');
    });

    it('rejects empty profile/reason without changing state', () => {
      const c = new ConnectionLifecycle();
      expect(() => c.connect('')).toThrow('ConnectionLifecycle: profile must be a non-empty string');
      expect(c.state).toBe('disconnected');
      c.update(100);
      c.connect('alice');
      c.connected();
      expect(() => c.handshakeRejected('')).toThrow('ConnectionLifecycle: reason must be a non-empty string');
      expect(c.state).toBe('handshaking');
      expect(c.reason).toBeNull();
    });

    it('reset restores a pristine disconnected state', () => {
      const c = new ConnectionLifecycle({ historyLimit: 3 });
      c.update(1000);
      c.connect('alice');
      c.connected();
      c.handshakeAccepted();
      c.reset();
      expect(c.state).toBe('disconnected');
      expect(c.profile).toBeNull();
      expect(c.keepAliveCount).toBe(0);
      expect(c.history).toEqual([]);
    });
  });
});
