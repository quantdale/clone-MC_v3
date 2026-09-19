import { describe, expect, it } from 'vitest';
import { DeathRespawnPanel } from '../../src/ui/DeathRespawnPanel';
import type { DeathPresentation } from '../../src/simulation/DeathRespawnPresentation';

class FakeElement {
  id = '';
  children: FakeElement[] = [];
  classes = new Set<string>();
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  private text = '';

  constructor(public tagName = 'div', id = '') {
    this.id = id;
  }

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  get classList(): {
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  } {
    const classes = this.classes;
    return {
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

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

const VIEW: DeathPresentation = {
  cause: 'fall',
  causeText: 'Fall',
  outcome: 'respawned',
  outcomeText: 'Respawned safely',
  actionLabel: 'Continue',
};

function makeRoot(): {
  root: FakeElement;
  cause: FakeElement;
  outcome: FakeElement;
  action: FakeElement;
} {
  const root = new FakeElement('div', 'death-screen');
  root.classes.add('hidden');
  const cause = new FakeElement('p', 'death-cause');
  const outcome = new FakeElement('p', 'death-outcome');
  const action = new FakeElement('button', 'death-continue');
  root.append(cause, outcome, action);
  return { root, cause, outcome, action };
}

describe('DeathRespawnPanel (280)', () => {
  it('fails fast when the shell is incomplete', () => {
    const root = new FakeElement('div', 'death-screen');
    expect(() => new DeathRespawnPanel(root as unknown as HTMLElement, { onContinue: () => undefined })).toThrow(
      /Death screen element missing: #death-cause/,
    );
  });

  it('renders a safe view, toggles visibility, and delegates Continue', () => {
    const { root, cause, outcome, action } = makeRoot();
    let continues = 0;
    const panel = new DeathRespawnPanel(root as unknown as HTMLElement, {
      onContinue: () => {
        continues++;
      },
    });

    expect(panel.isVisible()).toBe(false);
    panel.show(VIEW);
    expect(panel.isVisible()).toBe(true);
    expect(cause.textContent).toBe('Cause: Fall');
    expect(outcome.textContent).toBe('Respawned safely');
    expect(action.textContent).toBe('Continue');
    expect(action.getAttribute('aria-label')).toBe('Continue');

    for (const listener of action.listeners.get('click') ?? []) listener();
    expect(continues).toBe(1);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('updates text when the presentation signature changes', () => {
    const { root, cause, outcome, action } = makeRoot();
    const panel = new DeathRespawnPanel(root as unknown as HTMLElement, { onContinue: () => undefined });
    panel.show(VIEW);
    panel.show({
      cause: 'unknown',
      causeText: 'Unknown damage',
      outcome: 'spectating',
      outcomeText: 'Hardcore death — now spectating',
      actionLabel: 'Continue spectating',
    });
    expect(cause.textContent).toBe('Cause: Unknown damage');
    expect(outcome.textContent).toBe('Hardcore death — now spectating');
    expect(action.textContent).toBe('Continue spectating');
  });
});
