import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameRulePanel, type GameRulePanelDeps } from '../../src/ui/GameRulePanel';
import {
  GAME_RULE_KEYS,
  createDefaultGameRules,
  gameRuleDefinitions,
  parseGameRuleValue,
  setGameRule,
  type GameRuleStore,
  type GameRuleValue,
} from '../../src/simulation/GameRuleFramework';

/**
 * Production-wiring oracles for the gamerule settings screen (261): skeleton,
 * registry-driven rows, boolean toggles, integer validation, status strings,
 * and render caching — exercised through the real DOM controller over a
 * Game-shaped store. The vitest environment is `node`, so this follows the
 * BrewingPanel pattern of shimming just the touched DOM APIs.
 */

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  value = '';
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = '';

  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
  }

  get textContent(): string {
    return this.text;
  }

  /** Mirrors real DOM semantics: assigning textContent clears children. */
  set textContent(value: string) {
    this.text = value ?? '';
    this.children = [];
  }

  get classList(): {
    toggle(name: string, force?: boolean): void;
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  } {
    const classes = this.classes;
    return {
      toggle(name: string, force?: boolean): void {
        const effective = force === undefined ? !classes.has(name) : force;
        if (effective) classes.add(name);
        else classes.delete(name);
      },
      add(name: string): void {
        classes.add(name);
      },
      remove(name: string): void {
        classes.delete(name);
      },
      contains(name: string): boolean {
        return classes.has(name);
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, handler: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

function installDocumentShim(): void {
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: (tag: string) => new FakeElement(tag),
  };
}

beforeEach(() => {
  installDocumentShim();
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

/** Game-shaped backing store: parse + framework-validate, invalid = false. */
function makeDeps(initial?: GameRuleStore): { deps: GameRulePanelDeps; store(): GameRuleStore; changed(): number } {
  let store = initial ?? createDefaultGameRules();
  let changed = 0;
  const deps: GameRulePanelDeps = {
    getRules: () => store,
    setRule: (key, text) => {
      const parsed = parseGameRuleValue(key, text);
      if (parsed === null) return false;
      store = setGameRule(store, key as keyof GameRuleStore, parsed as GameRuleValue);
      return true;
    },
    onChanged: () => {
      changed++;
    },
    onClose: () => undefined,
  };
  return { deps, store: () => store, changed: () => changed };
}

function makeShell(): FakeElement {
  const el = new FakeElement('div', 'gamerule');
  const rows = new FakeElement('div', 'gamerule-rows');
  const status = new FakeElement('p', 'gamerule-status');
  const close = new FakeElement('button', 'gamerule-close');
  el.appendChild(rows);
  el.appendChild(status);
  el.appendChild(close);
  return el;
}

describe('GameRulePanel (261)', () => {
  it('throws fail-fast when required elements are missing', () => {
    const { deps } = makeDeps();
    expect(() => new GameRulePanel(new FakeElement('div') as unknown as HTMLElement, deps)).toThrow(
      /Gamerule element missing: #gamerule-rows/,
    );
    const el = new FakeElement('div');
    el.appendChild(new FakeElement('div', 'gamerule-rows'));
    expect(() => new GameRulePanel(el as unknown as HTMLElement, deps)).toThrow(
      /Gamerule element missing: #gamerule-status/,
    );
  });

  it('builds one row per registered rule in registry order', () => {
    const { deps } = makeDeps();
    const el = makeShell();
    const panel = new GameRulePanel(el as unknown as HTMLElement, deps);
    panel.show();
    const rows = el.querySelector('#gamerule-rows')!;
    expect(rows.children).toHaveLength(GAME_RULE_KEYS.length);
    expect(rows.children.map((c) => c.id)).toEqual(
      [...GAME_RULE_KEYS].map((k) => `gamerule-row-${k}`),
    );
    expect(gameRuleDefinitions()).toHaveLength(9);
  });

  it('show/hide/isVisible toggles the hidden class', () => {
    const { deps } = makeDeps();
    const el = makeShell();
    const panel = new GameRulePanel(el as unknown as HTMLElement, deps);
    panel.show();
    expect(panel.isVisible()).toBe(true);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('boolean toggle flips the store and reports status', () => {
    const ctx = makeDeps();
    const el = makeShell();
    const panel = new GameRulePanel(el as unknown as HTMLElement, ctx.deps);
    panel.show();
    const toggle = el.querySelector('#gamerule-toggle-mobGriefing')!;
    expect(toggle.textContent).toBe('true');
    toggle.dispatch('click');
    expect(ctx.store().mobGriefing).toBe(false);
    expect(toggle.textContent).toBe('false');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(panel.statusText()).toBe('mobGriefing set to false.');
    expect(ctx.changed()).toBe(1);
    toggle.dispatch('click');
    expect(ctx.store().mobGriefing).toBe(true);
  });

  it('valid integer text applies; invalid text is a no-op with status', () => {
    const ctx = makeDeps();
    const el = makeShell();
    const panel = new GameRulePanel(el as unknown as HTMLElement, ctx.deps);
    panel.show();
    const input = el.querySelector('#gamerule-input-randomTickSpeed')!;
    input.value = '7';
    input.dispatch('change');
    expect(ctx.store().randomTickSpeed).toBe(7);
    expect(panel.statusText()).toBe('randomTickSpeed set to 7.');
    input.value = 'abc';
    input.dispatch('change');
    expect(ctx.store().randomTickSpeed).toBe(7);
    expect(panel.statusText()).toBe(`randomTickSpeed: 'abc' is not a valid value — value unchanged.`);
    expect(ctx.changed()).toBe(1);
  });

  it('close button delegates to onClose', () => {
    let closed = 0;
    const ctx = makeDeps();
    const deps: GameRulePanelDeps = { ...ctx.deps, onClose: () => closed++ };
    const el = makeShell();
    new GameRulePanel(el as unknown as HTMLElement, deps);
    el.querySelector('#gamerule-close')!.dispatch('click');
    expect(closed).toBe(1);
  });

  it('second render with unchanged rules writes nothing (signature gate)', () => {
    const { deps } = makeDeps();
    const el = makeShell();
    const panel = new GameRulePanel(el as unknown as HTMLElement, deps);
    panel.show();
    const toggle = el.querySelector('#gamerule-toggle-mobGriefing')!;
    const before = toggle.textContent;
    panel.render();
    expect(toggle.textContent).toBe(before);
    expect(el.querySelector('#gamerule-status')!.textContent).toBe(
      'Edit a rule — changes apply immediately.',
    );
  });
});
