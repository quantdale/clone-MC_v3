import type {
  EnchantApplyResult,
  EnchantingTableSession,
  EnchantOffer,
} from '../inventory/EnchantingTable';

/**
 * Live enchanting screen (259). Pure view/controller over the authoritative
 * `Game` session: every render derives from `deps.getSession()` plus the
 * player level, lapis count, and held-item name. The panel owns no item, XP,
 * or lapis state of its own — the only panel-local state is the pending
 * offer selection index (-1 when none). Applying delegates to
 * `Game.applyEnchantingOffer`, which owns the atomic 120 spend semantics;
 * the panel never spends anything and never mutates stacks itself.
 */
export interface EnchantingPanelDeps {
  /** The live session, or null when none is open (renders as closed). */
  getSession(): EnchantingTableSession | null;
  /** Current player XP level (affordability display, advisory only). */
  getPlayerLevel(): number;
  /** Carried lapis count (affordability display, advisory only). */
  getLapisCount(): number;
  /** Held-item display name, or '' when none. */
  getHeldName(): string;
  /** Display names for an offer's enchantments (`Sharpness III` style). */
  describeOffer(offer: EnchantOffer): string[];
  /** Authoritative apply; null when the session was voided. */
  applyOffer(index: number): EnchantApplyResult | null;
  /** Inventory/XP changed (hotbar/hud refresh). */
  onChanged(): void;
  /** Close button pressed. */
  onClose(): void;
}

const ROMAN: Array<[number, string]> = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Format an enchantment level for display (`4` → `IV`, `12` → `12`). */
export function formatEnchantLevel(level: number): string {
  if (!Number.isInteger(level) || level <= 0) return String(level);
  if (level > 10) return String(level);
  let rest = level;
  let out = '';
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/** Prettify a registry key for display (`bane_of_arthropods` → `Bane Of Arthropods`). */
export function prettifyEnchantmentKey(key: string): string {
  return key
    .split('_')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export class EnchantingPanel {
  private readonly el: HTMLElement;
  private readonly deps: EnchantingPanelDeps;
  private readonly itemEl: HTMLElement;
  private readonly offersEl: HTMLElement;
  private readonly offerButtons: HTMLElement[] = [];
  private readonly applyButton: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement | null;

  /** Pending offer selection (-1 when none). The only panel-local state. */
  private selected = -1;
  /** Cached render signature to avoid pointless DOM churn each frame. */
  private lastRenderKey = '\0';
  /** Last user-facing status text. */
  private status = '';

  constructor(el: HTMLElement, deps: EnchantingPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.itemEl = this.requireElement('enchanting-item');
    this.offersEl = this.requireElement('enchanting-offers');
    for (let index = 0; index < 3; index++) {
      const button = this.requireElement(`enchanting-offer-${index}`);
      button.addEventListener('click', () => this.selectOffer(index));
      this.offerButtons.push(button);
    }
    const apply = this.requireElement('enchanting-apply');
    this.applyButton = apply;
    this.applyButton.addEventListener('click', () => {
      this.applySelected();
    });
    this.statusEl = this.requireElement('enchanting-status');
    this.closeButton = el.querySelector<HTMLButtonElement>('#enchanting-close');
    this.closeButton?.addEventListener('click', () => deps.onClose());
    this.status = 'Select an offer, then Apply.';
  }

  show(): void {
    this.el.classList.remove('hidden');
    this.lastRenderKey = '\0';
    this.render();
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.lastRenderKey = '\0';
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** Pending offer selection (-1 when none). */
  selectedOffer(): number {
    return this.selected;
  }

  /**
   * Make `index` the pending selection (toggle off when already selected).
   * Empty offers and out-of-range indices never become selected; the
   * selection is unchanged in that case.
   */
  selectOffer(index: number): void {
    const session = this.deps.getSession();
    const offers = session?.offers;
    if (!offers || !Number.isInteger(index) || index < 0 || index >= offers.length) {
      return;
    }
    if (offers[index]!.enchantments.length === 0) {
      return;
    }
    this.selected = this.selected === index ? -1 : index;
    if (this.selected >= 0) {
      const names = this.deps.describeOffer(offers[this.selected]!).join(', ');
      const cost = offers[this.selected]!.level;
      this.status =
        `Offer ${this.selected + 1} selected: ${names} — ` +
        `cost ${cost} levels + ${cost} lapis.`;
    } else {
      this.status = 'Select an offer, then Apply.';
    }
    this.lastRenderKey = '\0';
    this.render();
  }

  /**
   * Apply the pending selection through the authoritative delegate. Returns
   * the delegate result (null when nothing was armed or the session was
   * voided). On success the fresh post-apply session is re-rendered with
   * the selection reset; on failure the reason is shown and nothing was
   * spent (guaranteed by the 120 session core).
   */
  applySelected(): EnchantApplyResult | null {
    if (this.selected < 0) {
      this.status = 'Select an offer first.';
      this.lastRenderKey = '\0';
      this.render();
      return null;
    }
    const pending = this.selected;
    const pendingOffer = this.deps.getSession()?.offers[pending];
    const names = pendingOffer ? this.deps.describeOffer(pendingOffer).join(', ') : '';
    const result = this.deps.applyOffer(pending);
    if (!result) {
      this.selected = -1;
      this.status = 'Session changed — reopen the table.';
      this.lastRenderKey = '\0';
      this.render();
      return null;
    }
    if (result.ok) {
      this.selected = -1;
      this.status =
        `Enchanted with ${names} ` +
        `(−${result.xpSpent ?? 0} levels, −${result.lapisSpent ?? 0} lapis).`;
      this.deps.onChanged();
    } else {
      this.status = EnchantingPanel.reasonText(result.reason, pending, this.deps);
    }
    this.lastRenderKey = '\0';
    this.render();
    return result;
  }

  /** Re-render from the authoritative session (cheap when nothing changed). */
  render(): void {
    const session = this.deps.getSession();
    if (!session) {
      // INV-2: a null session always renders as closed — never stale offers.
      this.selected = -1;
      this.hide();
      return;
    }
    const level = this.deps.getPlayerLevel();
    const lapis = this.deps.getLapisCount();
    const heldName = this.deps.getHeldName();
    // Clamp a selection that stopped pointing at a real non-empty offer
    // (e.g. a fresh post-apply session with fewer usable offers).
    if (
      this.selected >= 0 &&
      (this.selected >= session.offers.length ||
        session.offers[this.selected]!.enchantments.length === 0)
    ) {
      this.selected = -1;
    }
    const key = this.renderSignature(session, level, lapis, heldName);
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    this.itemEl.textContent =
      heldName.length > 0 ? `Enchanting: ${heldName} (level ${level}, ${lapis} lapis)` : '';
    const allEmpty = session.offers.every((offer) => offer.enchantments.length === 0);
    for (let index = 0; index < this.offerButtons.length; index++) {
      const offer = session.offers[index];
      const button = this.offerButtons[index]!;
      if (!offer) {
        button.textContent = '';
        continue;
      }
      const names = this.deps.describeOffer(offer);
      button.textContent =
        offer.enchantments.length > 0
          ? `Offer ${index + 1}: ${names.join(', ')} — cost ${offer.level} levels`
          : `Offer ${index + 1}: no enchantment`;
      button.setAttribute(
        'aria-label',
        offer.enchantments.length > 0
          ? `offer ${index + 1}: ${names.join(', ')}, cost ${offer.level} levels`
          : `offer ${index + 1}: no enchantment`,
      );
      const affordable =
        offer.enchantments.length > 0 && offer.xpLevels <= level && offer.lapis <= lapis;
      if (affordable) {
        button.removeAttribute('disabled');
        button.setAttribute('aria-disabled', 'false');
      } else {
        button.setAttribute('disabled', 'true');
        button.setAttribute('aria-disabled', 'true');
      }
      button.classList.toggle('selected', this.selected === index);
    }
    if (allEmpty) {
      this.status = `No enchantments available for ${heldName}.`;
    }
    const armed =
      this.selected >= 0 &&
      this.selected < session.offers.length &&
      session.offers[this.selected]!.enchantments.length > 0;
    if (armed) {
      this.applyButton.removeAttribute('disabled');
      this.applyButton.setAttribute('aria-disabled', 'false');
    } else {
      this.applyButton.setAttribute('disabled', 'true');
      this.applyButton.setAttribute('aria-disabled', 'true');
    }
    this.statusEl.textContent = this.status;
    void this.offersEl;
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private static reasonText(
    reason: EnchantApplyResult['reason'],
    pending: number,
    deps: EnchantingPanelDeps,
  ): string {
    const session = deps.getSession();
    const cost = session?.offers[pending]?.level;
    switch (reason) {
      case 'insufficient_xp':
        return cost !== undefined ? `Not enough XP (need ${cost} levels).` : 'Not enough XP.';
      case 'insufficient_lapis':
        return cost !== undefined ? `Need lapis (${cost}).` : 'Need lapis.';
      case 'empty':
        return 'That offer holds no enchantment.';
      case 'ok':
        return 'Enchanted.';
      default:
        return 'That offer cannot be applied.';
    }
  }

  private renderSignature(
    session: EnchantingTableSession,
    level: number,
    lapis: number,
    heldName: string,
  ): string {
    const offers = session.offers
      .map(
        (offer) =>
          `${offer.level}:${offer.xpLevels}:${offer.lapis}:` +
          offer.enchantments.map((e) => `${String(e.id)}@${e.level}`).join(','),
      )
      .join('|');
    return [offers, level, lapis, heldName, this.selected, this.status].join('~');
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Enchanting element missing: #${id}`);
    }
    return found;
  }
}
