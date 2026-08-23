import { describe, it, expect } from 'vitest';
import { GameEventBus, WILDCARD_EVENT_TYPE } from '../../src/simulation/GameEventBus';

describe('GameEventBus', () => {
  it('delivers only to matching type listeners plus wildcard', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.on('a', () => seen.push('a'));
    bus.on('b', () => seen.push('b'));
    bus.on(WILDCARD_EVENT_TYPE, () => seen.push('*'));

    bus.emit({ type: 'a', tick: 1 });
    expect(seen).toEqual(['a', '*']);
  });

  it('delivers in subscription order, typed first then wildcard', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.on('t', () => seen.push('t1'));
    bus.on('t', () => seen.push('t2'));
    bus.on(WILDCARD_EVENT_TYPE, () => seen.push('w1'));
    bus.on(WILDCARD_EVENT_TYPE, () => seen.push('w2'));

    bus.emit({ type: 't', tick: 1 });
    expect(seen).toEqual(['t1', 't2', 'w1', 'w2']);
  });

  it('carries tick, position, and data', () => {
    const bus = new GameEventBus();
    let received: unknown;
    bus.on('block-broken', (e) => {
      received = e;
    });
    bus.emit({ type: 'block-broken', tick: 7, position: { x: 1, y: 2, z: 3 }, data: { id: 5 } });
    expect(received).toEqual({ type: 'block-broken', tick: 7, position: { x: 1, y: 2, z: 3 }, data: { id: 5 } });
  });

  it('unsubscribe stops delivery; once delivers exactly once', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    const unsubscribe = bus.on('a', () => seen.push('on'));
    bus.once('a', () => seen.push('once'));

    bus.emit({ type: 'a', tick: 1 });
    unsubscribe();
    bus.emit({ type: 'a', tick: 2 });

    expect(seen).toEqual(['on', 'once']);
  });

  it('a throwing listener does not block others and never escapes emit', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.on('a', () => {
      throw new Error('boom');
    });
    bus.on('a', () => seen.push('second'));

    expect(() => bus.emit({ type: 'a', tick: 1 })).not.toThrow();
    expect(seen).toEqual(['second']);
  });

  it('nested emits are delivered after the current batch, in order', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.on('outer', () => {
      seen.push('outer');
      bus.emit({ type: 'inner', tick: 1 });
    });
    bus.on('inner', () => seen.push('inner'));

    bus.emit({ type: 'outer', tick: 1 });
    expect(seen).toEqual(['outer', 'inner']);
  });

  it('clear removes all subscriptions', () => {
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.on('a', () => seen.push('a'));
    bus.on(WILDCARD_EVENT_TYPE, () => seen.push('*'));

    bus.clear();
    bus.emit({ type: 'a', tick: 1 });
    expect(seen).toEqual([]);
  });
});

describe('wildcard once (hardening 2026-08-23)', () => {
  it('unsubscribes a once wildcard listener after its first delivery', async () => {
    const { GameEventBus, WILDCARD_EVENT_TYPE } = await import('../../src/simulation/GameEventBus');
    const bus = new GameEventBus();
    const seen: string[] = [];
    bus.once(WILDCARD_EVENT_TYPE, (event) => seen.push(event.type));
    bus.emit({ type: 'a' } as never);
    bus.emit({ type: 'b' } as never);
    expect(seen).toEqual(['a']);
  });
});
