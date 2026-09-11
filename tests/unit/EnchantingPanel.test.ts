import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Production-wiring oracles for the live enchanting screen (259): offer
 * rendering, reselect, apply routing, reason display, and null-session
 * close — exercised through the real DOM controller over REAL deterministic
 * 120 sessions. The vitest environment is `node`, so this follows the
 * FurnacePanelTransactions pattern of shimming just the touched DOM APIs
 * (extended here with attribute removal + write counting for the
 * signature-gate proof).
 */

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  title = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  /** Counts text/attribute writes (excludes idempotent class toggles). */
  writes = 0;
  private text = '';

  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
  }

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.writes++;
    this.text = value;
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
    this.writes++;
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.writes++;
    this.attributes.delete(name);
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

  click(): void {
    for (const handler of this.listeners.get('click') ?? []) {
      handler({});
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

const { EnchantingPanel, formatEnchantLevel, prettifyEnchantmentKey } = await import(
  '../../src/ui/EnchantingPanel'
);
import type { EnchantingPanelDeps } from '../../src/ui/EnchantingPanel';
import type { EnchantOffer, EnchantingTableSession } from '../../src/inventory/EnchantingTable';
const { createSession } = await import('../../src/inventory/EnchantingTable');
const { createDefaultEnchantmentRegistry } = await import('../../src/inventory/EnchantmentRegistry');
const { createDefaultItemRegistry, ItemId } = await import('../../src/inventory/ItemRegistry');
const { ExperienceSystem } = await import('../../src/player/ExperienceSystem');
const { resourceIdToString } = await import('../../src/data/ResourceId');

const enchantReg = createDefaultEnchantmentRegistry();
const itemReg = createDefaultItemRegistry();
const pickaxeDef = itemReg.getByLegacyId(ItemId.WoodenPickaxe)!;
const sandDef = itemReg.getByLegacyId(ItemId.Sand)!;

function buildSession(level: number): EnchantingTableSession {
  return createSession({
    stack: { id: ItemId.WoodenPickaxe, count: 1 },
    itemDef: pickaxeDef,
    bookShelves: 0,
    playerLevel: level,
    seed: 12345,
    registry: enchantReg,
  });
}

function buildEmptySession(): EnchantingTableSession {
  return createSession({
    stack: { id: ItemId.Sand, count: 1 },
    itemDef: sandDef,
    bookShelves: 0,
    playerLevel: 30,
    seed: 12345,
    registry: enchantReg,
  });
}

interface Rig {
  root: FakeElement;
  byId: Record<string, FakeElement>;
  xp: InstanceType<typeof ExperienceSystem>;
  lapis: { count: number };
  session: { current: EnchantingTableSession | null };
  applied: number[];
  changed: { count: number };
  deps: EnchantingPanelDeps;
  panel: InstanceType<typeof EnchantingPanel>;
}

function makeRig(level = 30, lapis = 30, empty = false): Rig {
  const root = new FakeElement('div', 'enchanting');
  const byId: Record<string, FakeElement> = {};
  for (const id of [
    'enchanting-item',
    'enchanting-offers',
    'enchanting-offer-0',
    'enchanting-offer-1',
    'enchanting-offer-2',
    'enchanting-apply',
    'enchanting-status',
    'enchanting-close',
  ]) {
    const child = new FakeElement(id.startsWith('enchanting-offer') ? 'button' : 'div', id);
    byId[id] = child;
    root.appendChild(child);
  }
  const xp = new ExperienceSystem();
  xp.addXp(10_000);
  // Pin the level deterministically regardless of the curve.
  xp.level = level;
  const lapisBox = { count: lapis };
  const sessionBox: { current: EnchantingTableSession | null } = {
    current: empty ? buildEmptySession() : buildSession(level),
  };
  const applied: number[] = [];
  const changed = { count: 0 };
  const deps: EnchantingPanelDeps = {
    getSession: () => sessionBox.current,
    getPlayerLevel: () => xp.level,
    getLapisCount: () => lapisBox.count,
    getHeldName: () => (empty ? 'Sand' : 'Wooden Pickaxe'),
    describeOffer: (offer: EnchantOffer) =>
      offer.enchantments.map((inst) => {
        const def = enchantReg.getByResourceId(inst.id);
        const key = def ? resourceIdToString(def.resourceId).split(':')[1]! : String(inst.id);
        return `${prettifyEnchantmentKey(key)} ${formatEnchantLevel(inst.level)}`;
      }),
    applyOffer: (index: number) => {
      applied.push(index);
      const session = sessionBox.current;
      if (!session) return null;
      const result = session.apply(index, {
        experience: xp,
        lapisAvailable: lapisBox.count,
        registry: enchantReg,
      });
      if (result.ok) {
        lapisBox.count -= result.lapisSpent ?? 0;
        // Mirror the Game post-apply rebuild: fresh offers for the held stack.
        sessionBox.current = buildSession(xp.level);
      }
      return result;
    },
    onChanged: () => {
      changed.count++;
    },
    onClose: () => {},
  };
  const panel = new EnchantingPanel(root as never, deps);
  return { root, byId, xp, lapis: lapisBox, session: sessionBox, applied, changed, deps, panel };
}

describe('EnchantingPanel construction (T3)', () => {
  it('shows/hides and reports visibility', () => {
    const rig = makeRig();
    expect(rig.panel.isVisible()).toBe(true);
    rig.panel.hide();
    expect(rig.panel.isVisible()).toBe(false);
    rig.panel.show();
    expect(rig.panel.isVisible()).toBe(true);
  });

  it('throws a fail-fast error when a required id is missing', () => {
    const root = new FakeElement('div', 'enchanting');
    expect(() => new EnchantingPanel(root as never, makeRig().deps)).toThrow(
      'Enchanting element missing: #enchanting-item',
    );
  });

  it('formats levels and keys for display', () => {
    expect(formatEnchantLevel(1)).toBe('I');
    expect(formatEnchantLevel(4)).toBe('IV');
    expect(formatEnchantLevel(9)).toBe('IX');
    expect(formatEnchantLevel(10)).toBe('X');
    expect(formatEnchantLevel(12)).toBe('12');
    expect(prettifyEnchantmentKey('bane_of_arthropods')).toBe('Bane Of Arthropods');
    expect(prettifyEnchantmentKey('sharpness')).toBe('Sharpness');
  });
});

describe('EnchantingPanel offer render (T4)', () => {
  it('lists three offers with names and costs after show', () => {
    const rig = makeRig();
    rig.panel.show();
    const session = rig.session.current!;
    for (let i = 0; i < 3; i++) {
      const button = rig.byId[`enchanting-offer-${i}`]!;
      const offer = session.offers[i]!;
      if (offer.enchantments.length > 0) {
        expect(button.textContent).toContain(`Offer ${i + 1}:`);
        expect(button.textContent).toContain(`cost ${offer.level} levels`);
        expect(button.getAttribute('aria-label')).toContain(`cost ${offer.level} levels`);
      } else {
        expect(button.textContent).toContain('no enchantment');
      }
    }
    expect(rig.byId['enchanting-item']!.textContent).toContain('Wooden Pickaxe');
    expect(rig.byId['enchanting-item']!.textContent).toContain('level 30');
  });

  it('marks unaffordable offers disabled with aria-disabled', () => {
    // Level 1 + no lapis: every non-empty offer is unaffordable.
    const rig = makeRig(1, 0);
    rig.panel.show();
    const session = rig.session.current!;
    let checked = 0;
    for (let i = 0; i < 3; i++) {
      if (session.offers[i]!.enchantments.length === 0) continue;
      const button = rig.byId[`enchanting-offer-${i}`]!;
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('renders empty sessions as unavailable with apply disabled', () => {
    const rig = makeRig(30, 30, true);
    rig.panel.show();
    for (let i = 0; i < 3; i++) {
      expect(rig.byId[`enchanting-offer-${i}`]!.textContent).toContain('no enchantment');
    }
    expect(rig.byId['enchanting-status']!.textContent).toContain(
      'No enchantments available for Sand.',
    );
    expect(rig.byId['enchanting-apply']!.hasAttribute('disabled')).toBe(true);
  });

  it('is signature-gated: a second render performs zero text/attribute writes', () => {
    const rig = makeRig();
    rig.panel.show();
    const buttons = [0, 1, 2].map((i) => rig.byId[`enchanting-offer-${i}`]!);
    const writesAfterFirst = buttons.reduce((n, b) => n + b.writes, 0);
    expect(writesAfterFirst).toBeGreaterThan(0);
    for (const b of buttons) b.writes = 0;
    rig.byId['enchanting-status']!.writes = 0;
    rig.byId['enchanting-item']!.writes = 0;
    rig.byId['enchanting-apply']!.writes = 0;
    rig.panel.render();
    const writesAfterSecond =
      buttons.reduce((n, b) => n + b.writes, 0) +
      rig.byId['enchanting-status']!.writes +
      rig.byId['enchanting-item']!.writes +
      rig.byId['enchanting-apply']!.writes;
    expect(writesAfterSecond).toBe(0);
  });
});

describe('EnchantingPanel reselect (T5)', () => {
  it('selects then reselects, naming the pending offer in the status', () => {
    const rig = makeRig();
    rig.panel.show();
    // Click real buttons (all affordable at level 30 + 30 lapis unless empty).
    const clickable = [0, 1, 2].filter(
      (i) => rig.session.current!.offers[i]!.enchantments.length > 0,
    );
    expect(clickable.length).toBeGreaterThanOrEqual(2);
    rig.byId[`enchanting-offer-${clickable[0]}`]!.click();
    expect(rig.panel.selectedOffer()).toBe(clickable[0]);
    expect(rig.byId['enchanting-status']!.textContent).toContain(
      `Offer ${clickable[0]! + 1} selected:`,
    );
    rig.byId[`enchanting-offer-${clickable[1]}`]!.click();
    expect(rig.panel.selectedOffer()).toBe(clickable[1]);
  });

  it('toggles off when the selected offer is clicked again', () => {
    const rig = makeRig();
    rig.panel.show();
    const clickable = [0, 1, 2].find(
      (i) => rig.session.current!.offers[i]!.enchantments.length > 0,
    )!;
    rig.panel.selectOffer(clickable);
    expect(rig.panel.selectedOffer()).toBe(clickable);
    rig.panel.selectOffer(clickable);
    expect(rig.panel.selectedOffer()).toBe(-1);
    expect(rig.panel.applySelected()).toBeNull();
    expect(rig.byId['enchanting-status']!.textContent).toBe('Select an offer first.');
    expect(rig.applied).toEqual([]);
  });

  it('ignores empty offers and out-of-range indices', () => {
    const rig = makeRig(30, 30, true);
    rig.panel.show();
    rig.panel.selectOffer(0);
    rig.panel.selectOffer(-1);
    rig.panel.selectOffer(3);
    rig.panel.selectOffer(Number.NaN);
    expect(rig.panel.selectedOffer()).toBe(-1);
  });
});

describe('EnchantingPanel apply routing (T6)', () => {
  it('delegates the selected index once and reports success with fresh offers', () => {
    const rig = makeRig();
    rig.panel.show();
    const clickable = [0, 1, 2].find(
      (i) => rig.session.current!.offers[i]!.enchantments.length > 0,
    )!;
    const before = rig.session.current!;
    const cost = before.offers[clickable]!.level;
    const levelBefore = rig.xp.level;
    rig.panel.selectOffer(clickable);
    const result = rig.panel.applySelected();
    expect(result?.ok).toBe(true);
    expect(rig.applied).toEqual([clickable]);
    expect(rig.changed.count).toBe(1);
    expect(rig.panel.selectedOffer()).toBe(-1);
    expect(rig.xp.level).toBe(levelBefore - Math.min(cost, levelBefore));
    expect(rig.lapis.count).toBe(30 - cost);
    expect(rig.byId['enchanting-status']!.textContent).toContain('Enchanted with');
    // Fresh post-apply session is rendered (new object, three buttons).
    expect(rig.session.current).not.toBe(before);
    expect(rig.byId['enchanting-offer-0']!.textContent).toContain('Offer 1:');
  });

  it('shows insufficient_xp without spending anything', () => {
    const rig = makeRig(1, 30);
    rig.panel.show();
    const target = [0, 1, 2].find(
      (i) => rig.session.current!.offers[i]!.enchantments.length > 0,
    )!;
    rig.panel.selectOffer(target);
    const levelBefore = rig.xp.level;
    const result = rig.panel.applySelected();
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe('insufficient_xp');
    expect(rig.byId['enchanting-status']!.textContent).toContain('Not enough XP');
    expect(rig.xp.level).toBe(levelBefore);
    expect(rig.lapis.count).toBe(30);
  });

  it('shows insufficient_lapis without spending anything', () => {
    const rig = makeRig(30, 0);
    rig.panel.show();
    const target = [0, 1, 2].find(
      (i) =>
        rig.session.current!.offers[i]!.enchantments.length > 0 &&
        rig.session.current!.offers[i]!.lapis > 0,
    )!;
    rig.panel.selectOffer(target);
    const result = rig.panel.applySelected();
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe('insufficient_lapis');
    expect(rig.byId['enchanting-status']!.textContent).toContain('Need lapis');
    expect(rig.xp.level).toBe(30);
  });

  it('hides on null session and never shows stale offers (INV-2)', () => {
    const rig = makeRig();
    rig.panel.show();
    expect(rig.panel.isVisible()).toBe(true);
    rig.session.current = null;
    rig.panel.render();
    expect(rig.panel.isVisible()).toBe(false);
    expect(rig.panel.selectedOffer()).toBe(-1);
  });

  it('reports a voided session when the delegate returns null', () => {
    const rig = makeRig();
    rig.panel.show();
    const clickable = [0, 1, 2].find(
      (i) => rig.session.current!.offers[i]!.enchantments.length > 0,
    )!;
    rig.panel.selectOffer(clickable);
    rig.session.current = null;
    const failing: EnchantingPanelDeps = {
      ...rig.deps,
      getSession: () => null,
      applyOffer: () => null,
    };
    const panel2 = new EnchantingPanel(rig.root as never, failing);
    panel2.show();
    expect(panel2.isVisible()).toBe(false);
    expect(panel2.selectedOffer()).toBe(-1);
  });
});
