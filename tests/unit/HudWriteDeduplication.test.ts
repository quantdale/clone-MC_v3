import { describe, it, expect } from 'vitest';
import { HUD } from '../../src/ui/HUD';

/**
 * Change 254 R8: HUD chips assign textContent only when rendered content
 * changes; rendered output is unchanged.
 */

interface FakeNode {
  readonly id: string;
  _text: string;
  /** Backed by a counting accessor installed in fakeElement(). */
  textContent: string;
}

function fakeElement(...chipIds: string[]): {
  el: HTMLElement;
  chips: Map<string, FakeNode>;
  writesOf(id: string): number;
} {
  const chips = new Map<string, FakeNode>();
  const writes = new Map<string, number>();
  for (const id of chipIds) {
    chips.set(id, { id, _text: '', textContent: '' });
    writes.set(id, 0);
    const node = chips.get(id)!;
    Object.defineProperty(node, 'textContent', {
      get(): string {
        return node._text;
      },
      set(value: string): void {
        writes.set(id, (writes.get(id) ?? 0) + 1);
        node._text = value;
      },
      configurable: true,
    });
  }
  const el = {
    querySelector(selector: string): FakeNode | null {
      return chips.get(selector.replace(/^#/, '')) ?? null;
    },
    classList: {
      add(): void {},
      remove(): void {},
    },
  } as unknown as HTMLElement;
  return { el, chips, writesOf: (id) => writes.get(id) ?? 0 };
}

describe('HUD change-detected DOM writes (254 R8)', () => {
  it('setWorldTime writes once for repeated identical updates and renders identically', () => {
    const rig = fakeElement('world-time');
    const hud = new HUD(rig.el);
    hud.setWorldTime(12.5);
    hud.setWorldTime(12.5);
    hud.setWorldTime(12.5 + 1e-9);
    expect(rig.writesOf('world-time')).toBe(1);
    // Rendering matches the pre-254 format for the same input.
    expect(rig.chips.get('world-time')!.textContent).toBe('☀ 12:30');
  });

  it('night hours render the moon phase exactly as before', () => {
    const rig = fakeElement('world-time');
    const hud = new HUD(rig.el);
    hud.setWorldTime(0); // midnight
    expect(rig.chips.get('world-time')!.textContent).toBe('☾ 00:00');
    hud.setWorldTime(-1); // negative wraps like the pre-254 implementation
    expect(rig.chips.get('world-time')!.textContent).toBe('☾ 23:00');
    expect(rig.writesOf('world-time')).toBe(2);
  });

  it('setSurvival deduplicates per chip and keeps the compact format', () => {
    const rig = fakeElement('health-status', 'hunger-status');
    const hud = new HUD(rig.el);
    hud.setSurvival(20, 20); // ♥ 20 / 🍗 20
    hud.setSurvival(20, 19.5); // identical rendered text on both chips
    hud.setSurvival(18.2, 19.5); // ♥ 19 written; hunger still 🍗 20
    expect(rig.writesOf('health-status')).toBe(2);
    expect(rig.writesOf('hunger-status')).toBe(1);
    expect(rig.chips.get('health-status')!.textContent).toBe('♥ 19');
    expect(rig.chips.get('hunger-status')!.textContent).toBe('🍗 20');
  });

  it('setFPS rounds and deduplicates', () => {
    const rig = fakeElement(
      'fps-counter',
      'selected-block-name',
      'health-status',
      'hunger-status',
      'world-time',
    );
    const hud = new HUD(rig.el);
    hud.setFPS(59.6); // 60 FPS
    hud.setFPS(60.1); // 60 FPS — unchanged
    hud.setFPS(61.4); // 61 FPS
    expect(rig.writesOf('fps-counter')).toBe(2);
    expect(rig.chips.get('fps-counter')!.textContent).toBe('61 FPS');
  });

  it('setSelectedName skips identical names', () => {
    const rig = fakeElement('selected-block-name');
    const hud = new HUD(rig.el);
    hud.setSelectedName('Stone');
    hud.setSelectedName('Stone');
    hud.setSelectedName('Dirt');
    expect(rig.writesOf('selected-block-name')).toBe(2);
    expect(rig.chips.get('selected-block-name')!.textContent).toBe('Dirt');
  });
});
