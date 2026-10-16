import { describe, it, expect } from 'vitest';
import {
  TOUCH_ZONES,
  dragDelta,
  dragVector,
  resolveTouches,
  zoneAt,
} from '../../src/simulation/TouchFramework';

describe('zones', () => {
  it('defines the 7 zones with rects and actions (buttons first for hit precedence)', () => {
    expect(TOUCH_ZONES.map((z) => z.id)).toEqual([
      'jump',
      'sneak',
      'attack',
      'use',
      'inventory',
      'move',
      'look',
    ]);
    expect(TOUCH_ZONES[5]).toEqual({ id: 'move', x: 0, y: 0, width: 0.5, height: 1 });
    expect(TOUCH_ZONES[0]).toMatchObject({ id: 'jump', x: 0.62, y: 0.78, width: 0.18, height: 0.22, action: 'jump' });
    expect(TOUCH_ZONES[2]).toMatchObject({ id: 'attack', action: 'attack' });
    expect(TOUCH_ZONES[3]).toMatchObject({ id: 'use', action: 'use' });
    expect(TOUCH_ZONES[4]).toMatchObject({ id: 'inventory', action: 'inventory' });
  });

  it('hit-tests with inclusive edges, button precedence, and null outside', () => {
    expect(zoneAt({ x: 0.25, y: 0.5 })).toBe('move');
    expect(zoneAt({ x: 0.75, y: 0.5 })).toBe('look');
    expect(zoneAt({ x: 0.65, y: 0.85 })).toBe('jump');
    expect(zoneAt({ x: 0.18, y: 0.9 })).toBe('sneak');
    expect(zoneAt({ x: 0.95, y: 0.7 })).toBe('attack');
    expect(zoneAt({ x: 0.9, y: 0.08 })).toBe('inventory');
    expect(zoneAt({ x: 1, y: 0 })).toBe('look'); // inclusive edge of look
    expect(zoneAt({ x: 2, y: 2 })).toBeNull();
    expect(zoneAt({ x: 0.8, y: 0.7 })).toBe('use'); // use rect; jump starts at y = 0.78
  });
});

describe('drags', () => {
  it('scales the move vector by 4', () => {
    const v = dragVector({ zone: 'move', start: { x: 0.3, y: 0.5 }, current: { x: 0.4, y: 0.5 } });
    expect(v.x).toBeCloseTo(0.4);
    expect(v.y).toBe(0);
  });

  it('clamps the move vector to [-1, 1]', () => {
    expect(
      dragVector({ zone: 'move', start: { x: 0.3, y: 0.5 }, current: { x: 0.6, y: 0.5 } }),
    ).toEqual({ x: 1, y: 0 });
  });

  it('deadzones small move deltas', () => {
    expect(
      dragVector({ zone: 'move', start: { x: 0.3, y: 0.5 }, current: { x: 0.3125, y: 0.5 } }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('returns the raw delta for look', () => {
    const drag = { zone: 'look' as const, start: { x: 0.6, y: 0.5 }, current: { x: 0.8, y: 0.5 } };
    const delta = dragDelta(drag);
    expect(delta.x).toBeCloseTo(0.2);
    expect(delta.y).toBe(0);
  });
});

describe('resolution', () => {
  it('dedupes button actions and resolves move/look drags', () => {
    const state = resolveTouches([
      { point: { x: 0.65, y: 0.85 } }, // jump
      { point: { x: 0.85, y: 0.7 } }, // use
      { point: { x: 0.7, y: 0.85 } }, // jump again (deduped)
      { point: { x: 0.4, y: 0.5 }, previous: { x: 0.3, y: 0.5 } }, // move
      { point: { x: 0.8, y: 0.5 }, previous: { x: 0.6, y: 0.5 } }, // look
      { point: { x: 2, y: 2 } }, // out of every zone
    ]);
    expect(state.actions).toEqual(['jump', 'use']);
    expect(state.move.x).toBeCloseTo(0.4);
    expect(state.move.y).toBe(0);
    expect(state.lookDelta.x).toBeCloseTo(0.2);
    expect(state.lookDelta.y).toBe(0);
  });

  it('uses the last move/look touch', () => {
    const state = resolveTouches([
      { point: { x: 0.4, y: 0.5 }, previous: { x: 0.3, y: 0.5 } },
      { point: { x: 0.5, y: 0.5 }, previous: { x: 0.3, y: 0.5 } }, // larger delta wins
    ]);
    expect(state.move.x).toBeCloseTo(0.8);
    expect(state.move.y).toBe(0);
  });

  it('yields zero drags for previous-less move/look touches', () => {
    const state = resolveTouches([
      { point: { x: 0.25, y: 0.5 } }, // move, no previous
      { point: { x: 0.75, y: 0.5 } }, // look, no previous
    ]);
    expect(state.move).toEqual({ x: 0, y: 0 });
    expect(state.lookDelta).toEqual({ x: 0, y: 0 });
  });

  it('yields an empty state for no touches', () => {
    expect(resolveTouches([])).toEqual({ actions: [], move: { x: 0, y: 0 }, lookDelta: { x: 0, y: 0 } });
  });
});
