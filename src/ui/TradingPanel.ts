import type { TradeOffer } from '../simulation/VillagerTrading';

/**
 * Live trading-post screen (278). Pure view/controller over the authoritative
 * `Game` store: every render derives from `deps` getters plus panel-local
 * pending offer selection (-1 when none). The panel owns no trade state, no
 * inventory, and no XP — applying delegates to `Game.applyTradeOffer`, which
 * owns the atomic 151 spend semantics; the panel never spends anything itself.
 */
export interface TradingPanelDeps {
  /** All profession keys in stable order. */
  listProfessions(): readonly string[];
  /** Currently selected profession tab. */
  getProfession(): string;
  /** Select a profession tab (no-op for unknown keys). */
  selectProfession(key: string): boolean;
  /** Live offers for a profession (empty when unknown). */
  getOffers(professionKey: string): readonly TradeOffer[];
  /** Live villager level for a profession. */
  getLevel(professionKey: string): number;
  /** Live villager XP for a profession. */
  getXp(professionKey: string): number;
  /** Carried count for a 151 trade-item key (advisory affordability only). */
  getInventoryCount(itemKey: string): number;
  /** Human line for an offer (`20× Wheat → 1× Emerald`). */
  describeOffer(offer: TradeOffer): string;
  /** Authoritative apply; null only when the store vanished (never in practice). */
  applyOffer(professionKey: string, index: number): { ok: boolean; reason?: string } | null;
  /** Inventory/trade state changed (hotbar/hud refresh). */
  onChanged(): void;
  /** Close button pressed. */
  onClose(): void;
}

export function describeTradeOffer(offer: TradeOffer): string {
  const fmt = (item: string, count: number): string => `${count}× ${prettifyTradeKey(item)}`;
  const cost =
    offer.inputB !== null
      ? `${fmt(offer.inputA.item, offer.inputA.count)} + ${fmt(offer.inputB.item, offer.inputB.count)}`
      : fmt(offer.inputA.item, offer.inputA.count);
  return `${cost} → ${fmt(offer.result.item, offer.result.count)}`;
}

/** Prettify a 151 trade-item key (`iron_ingot` → `Iron Ingot`). */
export function prettifyTradeKey(key: string): string {
  return key
    .split('_')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export class TradingPanel {
  private readonly el: HTMLElement;
  private readonly deps: TradingPanelDeps;
  private readonly professionEl: HTMLElement;
  private readonly professionButtons: HTMLElement[] = [];
  private readonly metaEl: HTMLElement;
  private readonly offersEl: HTMLElement;
  private readonly offerButtons: HTMLElement[] = [];
  private readonly applyButton: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement | null;

  /** Pending offer selection (-1 when none). The only panel-local state. */
  private selected = -1;
  private lastRenderKey = '\0';
  private status = '';

  constructor(el: HTMLElement, deps: TradingPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.professionEl = this.requireElement('trading-professions');
    const professions = this.deps.listProfessions();
    for (let index = 0; index < professions.length; index++) {
      const button = this.requireElement(`trading-profession-${index}`);
      const key = professions[index]!;
      button.addEventListener('click', () => this.selectProfession(key));
      this.professionButtons.push(button);
    }
    this.metaEl = this.requireElement('trading-meta');
    this.offersEl = this.requireElement('trading-offers');
    for (let index = 0; index < 6; index++) {
      const button = this.requireElement(`trading-offer-${index}`);
      button.addEventListener('click', () => this.selectOffer(index));
      this.offerButtons.push(button);
    }
    this.applyButton = this.requireElement('trading-apply');
    this.applyButton.addEventListener('click', () => {
      this.applySelected();
    });
    this.statusEl = this.requireElement('trading-status');
    this.closeButton = el.querySelector<HTMLButtonElement>('#trading-close');
    this.closeButton?.addEventListener('click', () => deps.onClose());
    this.status = 'Select an offer, then Trade.';
  }

  show(): void {
    this.el.classList.remove('hidden');
    this.lastRenderKey = '\0';
    this.render();
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.selected = -1;
    this.status = 'Select an offer, then Trade.';
    this.lastRenderKey = '\0';
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** Pending offer selection (-1 when none). */
  selectedOffer(): number {
    return this.selected;
  }

  selectProfession(key: string): void {
    const ok = this.deps.selectProfession(key);
    if (!ok) return;
    this.selected = -1;
    this.status = 'Select an offer, then Trade.';
    this.lastRenderKey = '\0';
    this.render();
  }

  /**
   * Make `index` the pending selection (toggle off when already selected).
   * Out-of-range indices never become selected.
   */
  selectOffer(index: number): void {
    const offers = this.deps.getOffers(this.deps.getProfession());
    if (!Number.isInteger(index) || index < 0 || index >= offers.length) return;
    this.selected = this.selected === index ? -1 : index;
    if (this.selected >= 0) {
      const names = this.deps.describeOffer(offers[this.selected]!);
      this.status = `Offer ${this.selected + 1} selected: ${names}.`;
    } else {
      this.status = 'Select an offer, then Trade.';
    }
    this.lastRenderKey = '\0';
    this.render();
  }

  /**
   * Apply the pending selection through the authoritative delegate. Returns
   * the delegate result (null when nothing was armed). On success the fresh
   * post-apply store is re-rendered with the selection reset; on failure the
   * reason is shown and nothing was spent (guaranteed by the Game seam).
   */
  applySelected(): { ok: boolean; reason?: string } | null {
    if (this.selected < 0) {
      this.status = 'Select an offer first.';
      this.lastRenderKey = '\0';
      this.render();
      return null;
    }
    const profession = this.deps.getProfession();
    const pending = this.selected;
    const pendingOffer = this.deps.getOffers(profession)[pending];
    const names = pendingOffer ? this.deps.describeOffer(pendingOffer) : '';
    const result = this.deps.applyOffer(profession, pending);
    if (!result) {
      this.selected = -1;
      this.status = 'Trading unavailable — reopen the post.';
      this.lastRenderKey = '\0';
      this.render();
      return null;
    }
    if (result.ok) {
      this.selected = -1;
      this.status = `Traded: ${names}.`;
      this.deps.onChanged();
    } else {
      this.status = TradingPanel.reasonText(result.reason);
    }
    this.lastRenderKey = '\0';
    this.render();
    return result;
  }

  /** Re-render from the authoritative store (cheap when nothing changed). */
  render(): void {
    const professions = this.deps.listProfessions();
    const profession = this.deps.getProfession();
    const offers = this.deps.getOffers(profession);
    if (this.selected >= offers.length) this.selected = -1;
    const level = this.deps.getLevel(profession);
    const xp = this.deps.getXp(profession);
    const key = this.renderSignature(professions, profession, offers, level, xp);
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    for (let index = 0; index < this.professionButtons.length; index++) {
      const button = this.professionButtons[index]!;
      const k = professions[index]!;
      button.textContent = prettifyTradeKey(k);
      button.setAttribute('aria-label', `profession ${k}`);
      button.classList.toggle('selected', k === profession);
    }
    this.metaEl.textContent = `${prettifyTradeKey(profession)} — Lv${level} (${xp} XP)`;
    for (let index = 0; index < this.offerButtons.length; index++) {
      const offer = offers[index];
      const button = this.offerButtons[index]!;
      if (!offer) {
        button.textContent = '';
        button.classList.add('hidden');
        continue;
      }
      button.classList.remove('hidden');
      const names = this.deps.describeOffer(offer);
      const uses = `${offer.usesRemaining}/${offer.maxUses} left`;
      button.textContent = `Offer ${index + 1}: ${names} — ${uses}`;
      button.setAttribute('aria-label', `offer ${index + 1}: ${names}, ${uses}`);
      const affordable = this.isAffordable(offer) && offer.usesRemaining > 0;
      if (affordable) {
        button.removeAttribute('disabled');
        button.setAttribute('aria-disabled', 'false');
      } else {
        button.setAttribute('disabled', 'true');
        button.setAttribute('aria-disabled', 'true');
      }
      button.classList.toggle('selected', this.selected === index);
    }
    const armed = this.selected >= 0 && this.selected < offers.length;
    if (armed) {
      this.applyButton.removeAttribute('disabled');
      this.applyButton.setAttribute('aria-disabled', 'false');
    } else {
      this.applyButton.setAttribute('disabled', 'true');
      this.applyButton.setAttribute('aria-disabled', 'true');
    }
    this.statusEl.textContent = this.status;
    void this.offersEl;
    void this.professionEl;
  }

  private isAffordable(offer: TradeOffer): boolean {
    if (this.deps.getInventoryCount(offer.inputA.item) < offer.inputA.count) return false;
    if (offer.inputB !== null && this.deps.getInventoryCount(offer.inputB.item) < offer.inputB.count)
      return false;
    return true;
  }

  private static reasonText(reason: string | undefined): string {
    switch (reason) {
      case 'insufficient':
        return 'Need more items for that offer.';
      case 'exhausted':
        return 'Offer exhausted — restock soon.';
      case 'unknown':
        return 'Unknown trade.';
      default:
        return 'That offer cannot be applied.';
    }
  }

  private renderSignature(
    professions: readonly string[],
    profession: string,
    offers: readonly TradeOffer[],
    level: number,
    xp: number,
  ): string {
    const counts = offers
      .map((o) => {
        try {
          return `${o.inputA.item}x${o.inputA.count}+${o.inputB ? `${o.inputB.item}x${o.inputB.count}` : '—'}>${o.result.item}x${o.result.count}:${o.usesRemaining}/${o.maxUses}`;
        } catch {
          return '?';
        }
      })
      .join('|');
    const affordability = offers
      .map((o) => {
        try {
          return this.isAffordable(o) ? '1' : '0';
        } catch {
          return '0';
        }
      })
      .join('');
    return [professions.join(','), profession, counts, level, xp, affordability, this.selected, this.status].join('~');
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Trading element missing: #${id}`);
    }
    return found;
  }
}
