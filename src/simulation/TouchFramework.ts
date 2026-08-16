/**
 * Touch framework (210): the pure touch input model — normalized touch zones (movement, look,
 * and five action buttons over 207's actions), hit testing, drag math, and touch-to-action
 * resolution. Headless-safe: the wiring normalizes pointer events into points and feeds them in;
 * no pointer capture, no mutation of inputs, no throws.
 *
 * Determinism rules:
 * - Zones are fixed normalized (0..1) rects; `zoneAt` returns the FIRST matching zone in table
 *   order (inclusive edges) or null.
 * - `dragVector` = deadzone(clamp((current - start) * 4, -1, 1)) per axis — full deflection at a
 *   quarter of the screen; `dragDelta` is the raw offset.
 * - `resolveTouches` dedupes button actions, uses the LAST move/look touch, and treats a
 *   move/look touch without `previous` as a zero drag.
 */
import { applyDeadzone, type GamepadAxisPair } from './GamepadFramework';
import type { KeybindingAction } from './KeybindingFramework';

export type TouchZoneId = 'move' | 'look' | 'jump' | 'sneak' | 'attack' | 'use' | 'inventory';

/** A normalized (0..1) touch zone; button zones carry their 207 action. */
export interface TouchZone {
  readonly id: TouchZoneId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly action?: KeybindingAction;
}

/**
 * The fixed touch layout (vanilla-mobile-inspired). BUTTON zones precede the two half-screen
 * zones so hit testing resolves buttons first where the rects overlap.
 */
export const TOUCH_ZONES: readonly TouchZone[] = [
  { id: 'jump', x: 0.62, y: 0.78, width: 0.18, height: 0.22, action: 'jump' },
  { id: 'sneak', x: 0.14, y: 0.78, width: 0.18, height: 0.22, action: 'sneak' },
  { id: 'attack', x: 0.9, y: 0.62, width: 0.1, height: 0.2, action: 'attack' },
  { id: 'use', x: 0.78, y: 0.62, width: 0.12, height: 0.2, action: 'use' },
  { id: 'inventory', x: 0.86, y: 0.04, width: 0.14, height: 0.12, action: 'inventory' },
  { id: 'move', x: 0, y: 0, width: 0.5, height: 1 },
  { id: 'look', x: 0.5, y: 0, width: 0.5, height: 1 },
];

/** A normalized (0..1) touch point. */
export interface TouchPoint {
  readonly x: number;
  readonly y: number;
}

/** The first zone containing the point (inclusive edges), or null. */
export function zoneAt(point: TouchPoint, zones: readonly TouchZone[] = TOUCH_ZONES): TouchZoneId | null {
  for (const zone of zones) {
    if (
      point.x >= zone.x &&
      point.x <= zone.x + zone.width &&
      point.y >= zone.y &&
      point.y <= zone.y + zone.height
    ) {
      return zone.id;
    }
  }
  return null;
}

/** An active touch drag within a zone. */
export interface TouchDrag {
  readonly zone: TouchZoneId;
  readonly start: TouchPoint;
  readonly current: TouchPoint;
}

/** The movement vector: scaled 4x, clamped to [-1, 1], deadzoned. */
export function dragVector(drag: TouchDrag): GamepadAxisPair {
  return {
    x: applyDeadzone(clampAxis((drag.current.x - drag.start.x) * 4)),
    y: applyDeadzone(clampAxis((drag.current.y - drag.start.y) * 4)),
  };
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

/** The raw look offset. */
export function dragDelta(drag: TouchDrag): GamepadAxisPair {
  return { x: drag.current.x - drag.start.x, y: drag.current.y - drag.start.y };
}

/** One normalized touch, with its previous position when known. */
export interface TouchInput {
  readonly point: TouchPoint;
  readonly previous?: TouchPoint;
}

/** The resolved input state for the game to consume. */
export interface TouchInputState {
  readonly actions: readonly KeybindingAction[];
  readonly move: GamepadAxisPair;
  readonly lookDelta: GamepadAxisPair;
}

const ZERO: GamepadAxisPair = { x: 0, y: 0 };

/**
 * Resolve touches: button zones push their actions (deduped); move zones set the move vector and
 * look zones the look delta (the LAST touch of each kind wins). Touches outside every zone
 * contribute nothing; move/look touches without `previous` produce zero drags.
 */
export function resolveTouches(touches: readonly TouchInput[]): TouchInputState {
  const actions: KeybindingAction[] = [];
  let move: GamepadAxisPair = ZERO;
  let lookDelta: GamepadAxisPair = ZERO;

  for (const touch of touches) {
    const zone = zoneAt(touch.point);
    if (zone === null) continue;
    const drag: TouchDrag = {
      zone,
      start: touch.previous ?? touch.point,
      current: touch.point,
    };
    switch (zone) {
      case 'move':
        move = dragVector(drag);
        break;
      case 'look':
        lookDelta = dragDelta(drag);
        break;
      default: {
        const action = TOUCH_ZONES.find((z) => z.id === zone)?.action;
        if (action !== undefined && !actions.includes(action)) {
          actions.push(action);
        }
        break;
      }
    }
  }

  return { actions, move, lookDelta };
}
