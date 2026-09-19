import { describe, expect, it, beforeEach, afterEach } from 'vitest';

class FakeElement {
  id = '';
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = '';

  constructor(
    public tagName = 'div',
    id = '',
  ) {
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

  removeAttribute(name: string): void {
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

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

beforeEach(() => {
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: (tag: string) => new FakeElement(tag),
  };
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

const { TradingPanel, describeTradeOffer, prettifyTradeKey } = await import(
  '../../src/ui/TradingPanel'
);
import type { TradingPanelDeps } from '../../src/ui/TradingPanel';
import type { TradeOffer } from '../../src/simulation/VillagerTrading';
const { createVillagerTradeState } = await import('../../src/simulation/VillagerTrading');

const PROFESSIONS = ['farmer', 'librarian', 'weaponsmith'];

function makeRig(): {
  root: FakeElement;
  byId: Record<string, FakeElement>;
  deps: TradingPanelDeps;
  panel: InstanceType<typeof TradingPanel>;
  applied: Array<{ profession: string; index: number }>;
  profession: { current: string };
  counts: Record<string, number>;
} {
  const root = new FakeElement('div', 'trading');
  const byId: Record<string, FakeElement> = {};
  for (const id of [
    'trading-professions',
    'trading-profession-0',
    'trading-profession-1',
    'trading-profession-2',
    'trading-meta',
    'trading-offers',
    'trading-offer-0',
    'trading-offer-1',
    'trading-offer-2',
    'trading-offer-3',
    'trading-offer-4',
    'trading-offer-5',
    'trading-apply',
    'trading-status',
    'trading-close',
  ]) {
    const child = new FakeElement('div', id);
    byId[id] = child;
    root.appendChild(child);
  }
  const states = {
    farmer: createVillagerTradeState('farmer', 1),
    librarian: createVillagerTradeState('librarian', 1),
    weaponsmith: createVillagerTradeState('weaponsmith', 1),
  } as Record<string, ReturnType<typeof createVillagerTradeState>>;
  const profession = { current: 'farmer' };
  const counts: Record<string, number> = { wheat: 64 };
  const applied: Array<{ profession: string; index: number }> = [];
  const deps: TradingPanelDeps = {
    listProfessions: () => PROFESSIONS,
    getProfession: () => profession.current,
    selectProfession: (key: string) => {
      if (!PROFESSIONS.includes(key)) return false;
      profession.current = key;
      return true;
    },
    getOffers: (k: string) => states[k]?.offers ?? [],
    getLevel: (k: string) => states[k]?.level ?? 1,
    getXp: (k: string) => states[k]?.xp ?? 0,
    getInventoryCount: (k: string) => counts[k] ?? 0,
    describeOffer: (o: TradeOffer) => describeTradeOffer(o),
    applyOffer: (p: string, i: number) => {
      applied.push({ profession: p, index: i });
      return { ok: true };
    },
    onChanged: () => undefined,
    onClose: () => undefined,
  };
  const panel = new TradingPanel(root as unknown as HTMLElement, deps);
  return { root, byId, deps, panel, applied, profession, counts };
}

describe('TradingPanel (278)', () => {
  it('prettifies keys and describes offers', () => {
    expect(prettifyTradeKey('iron_ingot')).toBe('Iron Ingot');
    expect(prettifyTradeKey('wheat')).toBe('Wheat');
    const [offer] = createVillagerTradeState('farmer', 1).offers;
    expect(describeTradeOffer(offer!)).toContain('Wheat');
    expect(describeTradeOffer(offer!)).toContain('Emerald');
  });

  it('opens showing professions, meta, and offer rows', () => {
    const { panel, byId } = makeRig();
    panel.show();
    expect(panel.isVisible()).toBe(true);
    expect(byId['trading-profession-0']!.textContent).toBe('Farmer');
    expect(byId['trading-meta']!.textContent).toContain('Farmer');
    expect(byId['trading-meta']!.textContent).toContain('Lv1');
    expect(byId['trading-offer-0']!.textContent).toContain('Offer 1');
    expect(byId['trading-status']!.textContent).toBe('Select an offer, then Trade.');
  });

  it('selects a profession tab and resets the offer selection', () => {
    const { panel, profession, byId } = makeRig();
    panel.show();
    panel.selectOffer(0);
    expect(panel.selectedOffer()).toBe(0);
    panel.selectProfession('librarian');
    expect(profession.current).toBe('librarian');
    expect(panel.selectedOffer()).toBe(-1);
    expect(byId['trading-meta']!.textContent).toContain('Librarian');
  });

  it('ignores unknown profession selections', () => {
    const { panel, profession } = makeRig();
    panel.show();
    panel.selectProfession('not_a_profession');
    expect(profession.current).toBe('farmer');
  });

  it('toggles offer selection and applies once through the delegate', () => {
    const { panel, applied, byId } = makeRig();
    panel.show();
    panel.selectOffer(0);
    expect(panel.selectedOffer()).toBe(0);
    panel.selectOffer(0);
    expect(panel.selectedOffer()).toBe(-1);
    panel.selectOffer(0);
    panel.applySelected();
    expect(applied).toEqual([{ profession: 'farmer', index: 0 }]);
    expect(panel.selectedOffer()).toBe(-1);
    expect(byId['trading-status']!.textContent).toContain('Traded');
  });

  it('ignores out-of-range selections and requires a selection to apply', () => {
    const { panel, applied } = makeRig();
    panel.show();
    panel.selectOffer(99);
    expect(panel.selectedOffer()).toBe(-1);
    expect(panel.applySelected()).toBeNull();
    expect(applied).toEqual([]);
  });

  it('surfaces delegate failure reasons without spending', () => {
    const rig = makeRig();
    rig.deps.applyOffer = () => ({ ok: false, reason: 'insufficient' });
    const { panel, byId } = rig;
    panel.show();
    panel.selectOffer(0);
    panel.applySelected();
    expect(byId['trading-status']!.textContent).toContain('Need more items');
  });

  it('hides and reports visibility', () => {
    const { panel } = makeRig();
    panel.show();
    expect(panel.isVisible()).toBe(true);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });
});
