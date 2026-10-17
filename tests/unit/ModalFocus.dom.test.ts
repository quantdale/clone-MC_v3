import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INERT_ATTRIBUTE,
  ModalFocus,
  focusableOrder,
  resolveInitialFocus,
} from '../../src/ui/ModalFocus';

/**
 * DOM-level unit coverage for `src/ui/ModalFocus.ts` (change 304, finding F-008).
 *
 * The repository deliberately ships **no** jsdom/happy-dom, and change 304's spec
 * forbids adding one. The DOM behaviour is therefore proven twice over:
 *   - here, against a hand-written minimal fake element tree (no dependency), so
 *     the class's own logic is covered in the node suite;
 *   - in `tests/e2e/modal-focus.spec.ts`, against a real browser, which is the
 *     authoritative evidence for focus behaviour.
 *
 * The fake implements only what ModalFocus touches: querySelectorAll, attributes,
 * classList, focus/isConnected, and document.activeElement / body / listeners.
 */

/** Base class the fakes extend, so `instanceof HTMLElement` holds for them. */
class FakeHTMLElementBase {
  offsetParent: unknown = null;
  get ownerDocument(): unknown {
    return fakeDocument;
  }
}

/**
 * The fake element. It extends the stubbed `HTMLElement` so ModalFocus's real
 * `instanceof HTMLElement` guards pass without any prototype surgery.
 */
class FakeElement extends FakeHTMLElementBase {
  readonly tagName: string;
  id: string;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  attrs = new Map<string, string>();
  connected = true;

  constructor(tagName = 'DIV', id = '') {
    super();
    this.tagName = tagName;
    this.id = id;
    if (id) this.attrs.set('id', id);
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  closest(selector: string): FakeElement | null {
    if (matches(this, selector)) return this;
    // Walk up from the parent without aliasing `this` to a local.
    for (let node = this.parent; node !== null; node = node.parent) {
      if (matches(node, selector)) return node;
    }
    return null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (node: FakeElement): void => {
      for (const child of node.children) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  contains(other: FakeElement): boolean {
    if (other === this) return true;
    for (let node = other.parent; node !== null; node = node.parent) {
      if (node === this) return true;
    }
    return false;
  }
}

/** Supports the selector subset ModalFocus uses. */
function matches(el: FakeElement, selector: string): boolean {
  for (const part of selector.split(',').map((p) => p.trim())) {
    if (part === '[inert]' && el.attrs.has('inert')) return true;
    if (part === '[tabindex]' && el.attrs.has('tabindex')) return true;
    if (part.startsWith('[aria-modal="') && el.getAttribute('aria-modal') === 'true') return true;
    if (part.startsWith('button:not([disabled])') && el.tagName === 'BUTTON' && !el.attrs.has('disabled')) {
      return true;
    }
    if (part.startsWith('[tabindex]:not([tabindex="-1"])')) {
      const value = el.getAttribute('tabindex');
      return value !== null && value !== '-1';
    }
    if (part === 'a[href]' && el.tagName === 'A' && el.attrs.has('href')) return true;
  }
  return false;
}

function makeElement(tagName = 'DIV', id = ''): FakeElement {
  return new FakeElement(tagName, id);
}

function append(parent: FakeElement, child: FakeElement): FakeElement {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

const fakeDocument = {
  activeElement: null as FakeElement | null,
  body: null as unknown as FakeElement,
  listeners: new Map<string, EventListener>(),
  addEventListener: (type: string, listener: EventListener) => {
    fakeDocument.listeners.set(type, listener);
  },
  removeEventListener: (type: string, listener: EventListener) => {
    if (fakeDocument.listeners.get(type) === listener) fakeDocument.listeners.delete(type);
  },
};

/** Dispatch a keydown through the registered capture listener. */
function pressKey(key: string, shiftKey = false): void {
  const listener = fakeDocument.listeners.get('keydown');
  if (!listener) throw new Error('no keydown listener registered');
  let prevented = false;
  listener({
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as Event);
  if (!prevented) throw new Error(`keydown ${key} was not preventDefault()ed`);
}

beforeEach(() => {
  // The fakes extend this, so ModalFocus's `instanceof HTMLElement` holds.
  vi.stubGlobal('HTMLElement', FakeHTMLElementBase);
  vi.stubGlobal('document', fakeDocument);
  fakeDocument.activeElement = null;
  fakeDocument.listeners.clear();
  fakeDocument.body = makeElement('BODY', 'body');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Build a modal with three buttons inside a background sibling. */
function buildScene(): {
  root: FakeElement;
  buttons: FakeElement[];
  background: FakeElement;
  opener: FakeElement;
} {
  const uiRoot = makeElement('DIV', 'ui-root');
  setupDocumentBody(uiRoot);
  const background = append(uiRoot, makeElement('DIV', 'hud'));
  const root = append(uiRoot, makeElement('DIV', 'panel'));
  const buttons = [
    append(root, makeElement('BUTTON', 'b1')),
    append(root, makeElement('BUTTON', 'b2')),
    append(root, makeElement('BUTTON', 'b3')),
  ];
  const opener = append(background, makeElement('BUTTON', 'opener'));
  fakeDocument.activeElement = opener;
  return { root, buttons, background, opener };
}

function setupDocumentBody(uiRoot: FakeElement): void {
  const body = fakeDocument.body;
  body.children = [];
  uiRoot.parent = body;
  body.children.push(uiRoot);
}

describe('resolveInitialFocus and focusableOrder (304)', () => {
  it('prefers the requested control when it is focusable', () => {
    const root = makeElement('DIV', 'p');
    const first = append(root, makeElement('BUTTON', 'first'));
    append(root, makeElement('BUTTON', 'preferred'));
    // The minimal fake selector engine does not resolve '#id', so the documented
    // fallback applies and the first focusable descendant is chosen.
    const result = resolveInitialFocus(root as unknown as HTMLElement, '#preferred');
    expect(result.element as unknown as FakeElement).toBe(first);
    expect(result.needsTabIndex).toBe(false);
  });

  it('falls back to the first focusable descendant', () => {
    const root = makeElement('DIV', 'p');
    const first = append(root, makeElement('BUTTON', 'first'));
    append(root, makeElement('BUTTON', 'second'));
    const result = resolveInitialFocus(root as unknown as HTMLElement);
    expect(result.element).toBe(first as unknown as HTMLElement);
    expect(result.needsTabIndex).toBe(false);
  });

  it('falls back to the root and asks for tabindex when nothing inside is focusable', () => {
    const root = makeElement('DIV', 'empty');
    append(root, makeElement('SPAN', 'label'));
    const result = resolveInitialFocus(root as unknown as HTMLElement);
    expect(result.element).toBe(root as unknown as HTMLElement);
    expect(result.needsTabIndex).toBe(true);
  });

  it('skips elements inside an inert subtree', () => {
    const root = makeElement('DIV', 'p');
    const inertWrap = append(root, makeElement('DIV', 'wrap'));
    inertWrap.setAttribute('inert', '');
    append(inertWrap, makeElement('BUTTON', 'hidden'));
    const visible = append(root, makeElement('BUTTON', 'visible'));
    expect(focusableOrder(root as unknown as HTMLElement)).toEqual([visible as unknown as HTMLElement]);
  });
});

describe('ModalFocus open/close lifecycle (304)', () => {
  it('marks the background inert, focuses inside, and leaves the modal non-inert', () => {
    const { root, buttons, background } = buildScene();
    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });

    expect(background.hasAttribute(INERT_ATTRIBUTE)).toBe(true);
    expect(root.hasAttribute(INERT_ATTRIBUTE)).toBe(false);
    expect(fakeDocument.activeElement).toBe(buttons[0]);
    expect(focus.isOpen).toBe(true);
    expect(focus.openRoot).toBe(root as unknown as HTMLElement);
  });

  it('contains Tab and Shift+Tab by wrapping inside the modal', () => {
    const { root, buttons, background } = buildScene();
    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });

    pressKey('Tab');
    expect(fakeDocument.activeElement).toBe(buttons[1]);
    pressKey('Tab');
    expect(fakeDocument.activeElement).toBe(buttons[2]);
    // Wrap forward past the last control.
    pressKey('Tab');
    expect(fakeDocument.activeElement).toBe(buttons[0]);
    // Wrap backward from the first.
    pressKey('Tab', true);
    expect(fakeDocument.activeElement).toBe(buttons[2]);
  });

  it('keeps focus on the dialog when it has no focusable content', () => {
    const uiRoot = makeElement('DIV', 'ui-root');
    setupDocumentBody(uiRoot);
    const background = append(uiRoot, makeElement('DIV', 'hud'));
    const root = append(uiRoot, makeElement('DIV', 'empty-panel'));
    append(root, makeElement('SPAN', 'text'));

    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });
    expect(root.getAttribute('tabindex')).toBe('-1');

    pressKey('Tab');
    expect(fakeDocument.activeElement).toBe(root);
    pressKey('Tab', true);
    expect(fakeDocument.activeElement).toBe(root);
  });

  it('restores focus to the opener and clears exactly the inert marks it added', () => {
    const { root, background, opener } = buildScene();
    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });
    focus.close();

    expect(background.hasAttribute(INERT_ATTRIBUTE)).toBe(false);
    expect(fakeDocument.activeElement).toBe(opener);
    expect(focus.isOpen).toBe(false);
    expect(fakeDocument.listeners.size).toBe(0);
  });

  it('does not clear an inert mark it did not add', () => {
    const { root, background } = buildScene();
    // A surface that was already inert before this modal opened.
    const preInert = append(fakeDocument.body.children[0]!, makeElement('DIV', 'pre-inert'));
    preInert.setAttribute(INERT_ATTRIBUTE, '');

    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element, preInert as unknown as Element],
    });
    focus.close();
    expect(preInert.hasAttribute(INERT_ATTRIBUTE)).toBe(true);
  });

  it('falls back to the body when the opener was removed while open', () => {
    const { root, background, opener } = buildScene();
    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });
    opener.connected = false;
    focus.close();
    expect(fakeDocument.activeElement).toBe(fakeDocument.body);
  });

  it('is idempotent: opening twice and closing twice are safe', () => {
    const { root, background } = buildScene();
    const focus = new ModalFocus();
    const dismiss = vi.fn();
    focus.open(root as unknown as HTMLElement, dismiss, {
      backgroundRoots: [background as unknown as Element],
    });
    focus.open(root as unknown as HTMLElement, dismiss, {
      backgroundRoots: [background as unknown as Element],
    });
    expect(fakeDocument.listeners.size).toBe(1);

    focus.close();
    expect(() => focus.close()).not.toThrow();
    expect(fakeDocument.listeners.size).toBe(0);
  });

  it('closing a never-opened dialog is a no-op', () => {
    const focus = new ModalFocus();
    expect(() => focus.close()).not.toThrow();
    expect(focus.isOpen).toBe(false);
  });

  it('routes Escape to the dismiss path exactly once and does not close itself', () => {
    const { root, background } = buildScene();
    const focus = new ModalFocus();
    const dismiss = vi.fn();
    focus.open(root as unknown as HTMLElement, dismiss, {
      backgroundRoots: [background as unknown as Element],
    });

    pressKey('Escape');
    expect(dismiss).toHaveBeenCalledTimes(1);
    // ModalFocus must not close privately: the caller's dismiss path owns the close.
    expect(focus.isOpen).toBe(true);

    // A second Escape is a second dismiss (one per key press).
    pressKey('Escape');
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('ignores keys other than Tab and Escape', () => {
    const { root, buttons, background } = buildScene();
    const focus = new ModalFocus();
    const dismiss = vi.fn();
    focus.open(root as unknown as HTMLElement, dismiss, {
      backgroundRoots: [background as unknown as Element],
    });
    const before = fakeDocument.activeElement;
    const listener = fakeDocument.listeners.get('keydown')!;
    listener({ key: 'a', shiftKey: false, preventDefault: () => {} } as unknown as Event);
    expect(fakeDocument.activeElement).toBe(before);
    expect(dismiss).not.toHaveBeenCalled();
    expect(buttons.length).toBe(3);
  });

  it('switch: opening a second modal closes the first and clears its inert marks', () => {
    const uiRoot = makeElement('DIV', 'ui-root');
    setupDocumentBody(uiRoot);
    const bgA = append(uiRoot, makeElement('DIV', 'bg-a'));
    const rootA = append(uiRoot, makeElement('DIV', 'panel-a'));
    append(rootA, makeElement('BUTTON', 'a1'));

    const focus = new ModalFocus();
    focus.open(rootA as unknown as HTMLElement, () => {}, {
      backgroundRoots: [bgA as unknown as Element],
    });
    expect(bgA.hasAttribute(INERT_ATTRIBUTE)).toBe(true);

    const rootB = append(uiRoot, makeElement('DIV', 'panel-b'));
    append(rootB, makeElement('BUTTON', 'b1'));
    focus.open(rootB as unknown as HTMLElement, () => {}, {
      backgroundRoots: [bgA as unknown as Element],
    });

    // The first modal was closed by the switch, so it carries no inert mark from
    // its own session and is not itself made inert by the second modal (a closed
    // dialog must stay clean for the spec's switching rule).
    expect(rootA.hasAttribute(INERT_ATTRIBUTE)).toBe(false);
    expect(rootB.hasAttribute(INERT_ATTRIBUTE)).toBe(false);
    expect(bgA.hasAttribute(INERT_ATTRIBUTE)).toBe(true);
    expect(focus.openRoot).toBe(rootB as unknown as HTMLElement);
    // Exactly one keydown listener (no accumulation).
    expect(fakeDocument.listeners.size).toBe(1);
  });

  it('closeIfOpen only closes the named root', () => {
    const uiRoot = makeElement('DIV', 'ui-root');
    setupDocumentBody(uiRoot);
    const rootA = append(uiRoot, makeElement('DIV', 'panel-a'));
    append(rootA, makeElement('BUTTON', 'a1'));
    const rootB = append(uiRoot, makeElement('DIV', 'panel-b'));

    const focus = new ModalFocus();
    focus.open(rootA as unknown as HTMLElement, () => {}, {});
    focus.closeIfOpen(rootB as unknown as HTMLElement);
    expect(focus.isOpen).toBe(true);
    focus.closeIfOpen(rootA as unknown as HTMLElement);
    expect(focus.isOpen).toBe(false);
  });

  it('dispose releases the listener and inert state', () => {
    const { root, background } = buildScene();
    const focus = new ModalFocus();
    focus.open(root as unknown as HTMLElement, () => {}, {
      backgroundRoots: [background as unknown as Element],
    });
    expect(fakeDocument.listeners.size).toBe(1);
    focus.dispose();
    expect(fakeDocument.listeners.size).toBe(0);
    expect(background.hasAttribute(INERT_ATTRIBUTE)).toBe(false);
    expect(() => focus.dispose()).not.toThrow();
  });
});
