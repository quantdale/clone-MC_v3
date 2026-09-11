import {
  gameRuleDefinitions,
  type GameRuleKey,
  type GameRuleStore,
} from '../simulation/GameRuleFramework';

/**
 * Live gamerule settings screen (261). Pure view/controller over the
 * authoritative `Game` store: every render derives from `deps.getRules()`.
 * The panel owns no rule state of its own — the only panel-local state is the
 * user-facing status text. Edits delegate to `Game.setGameRule` through the
 * text-entry `deps.setRule`, which owns parse + validate + persist semantics;
 * invalid text is a status-surfaced no-op and never touches the store.
 */
export interface GameRulePanelDeps {
  /** The live gamerule store. */
  getRules(): GameRuleStore;
  /**
   * Parse `text` for `key` and apply it when valid (persisting through Game).
   * Returns true when applied, false when the text is invalid (no-op).
   */
  setRule(key: string, text: string): boolean;
  /** A rule changed (currently unused by Game; reserved for HUD refresh). */
  onChanged(): void;
  /** Close button pressed. */
  onClose(): void;
}

export class GameRulePanel {
  private readonly el: HTMLElement;
  private readonly deps: GameRulePanelDeps;
  private readonly rowsEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement | null;
  /** Cached render signature to avoid pointless DOM churn each frame. */
  private lastRenderKey = '\0';
  /** Last user-facing status text. */
  private status = '';

  constructor(el: HTMLElement, deps: GameRulePanelDeps) {
    this.el = el;
    this.deps = deps;
    this.rowsEl = this.requireElement('gamerule-rows');
    this.statusEl = this.requireElement('gamerule-status');
    this.closeButton = el.querySelector<HTMLButtonElement>('#gamerule-close');
    this.closeButton?.addEventListener('click', () => deps.onClose());
    this.status = 'Edit a rule — changes apply immediately.';
    this.buildRows();
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

  /** Last user-facing status text (E2E observability). */
  statusText(): string {
    return this.status;
  }

  /** Re-render from the authoritative store (cheap when nothing changed). */
  render(): void {
    const rules = this.deps.getRules();
    const key = this.renderSignature(rules);
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;
    for (const def of gameRuleDefinitions()) {
      const current = rules[def.key as GameRuleKey];
      const row = this.rowsEl.querySelector(`#gamerule-row-${def.key}`);
      if (!row) continue;
      const label = row.querySelector(`#gamerule-label-${def.key}`);
      if (label) {
        label.textContent = `${def.key} (${def.kind}, default ${String(def.defaultValue)})`;
      }
      const toggle = row.querySelector(`#gamerule-toggle-${def.key}`);
      if (toggle && def.kind === 'boolean') {
        const value = current === true;
        toggle.textContent = value ? 'true' : 'false';
        toggle.setAttribute('aria-pressed', value ? 'true' : 'false');
        toggle.setAttribute('aria-label', `${def.key}: ${value ? 'true' : 'false'}. Activate to toggle.`);
      }
      const input = row.querySelector(`#gamerule-input-${def.key}`) as HTMLInputElement | null;
      if (input && def.kind !== 'boolean') {
        const text = String(current ?? '');
        // Never clobber text the user is mid-edit: only sync the input when
        // it does not have focus. (FakeElement shims lack focus tracking, so
        // the write is unconditional there — harmless in tests.)
        const active = typeof document !== 'undefined' && (document as Document).activeElement;
        if (!active || active !== (input as unknown as Element)) {
          input.value = text;
        }
      }
    }
    this.statusEl.textContent = this.status;
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector(`#${id}`);
    if (!found) {
      throw new Error(`Gamerule element missing: #${id}`);
    }
    return found as HTMLElement;
  }

  /** Build one row per registered rule, in registry order (I1). */
  private buildRows(): void {
    const doc = GameRulePanel.ownerDocument();
    for (const def of gameRuleDefinitions()) {
      const row = doc.createElement('div');
      row.id = `gamerule-row-${def.key}`;
      row.className = 'gamerule-row';

      const label = doc.createElement('label');
      label.id = `gamerule-label-${def.key}`;
      label.className = 'gamerule-label';
      label.textContent = `${def.key} (${def.kind}, default ${String(def.defaultValue)})`;
      row.appendChild(label);

      if (def.kind === 'boolean') {
        const toggle = doc.createElement('button');
        toggle.id = `gamerule-toggle-${def.key}`;
        toggle.className = 'gamerule-toggle';
        toggle.setAttribute('type', 'button');
        toggle.addEventListener('click', () => this.toggleBoolean(def.key));
        label.setAttribute('for', toggle.id);
        row.appendChild(toggle);
      } else {
        const input = doc.createElement('input');
        input.id = `gamerule-input-${def.key}`;
        input.className = 'gamerule-input';
        input.setAttribute('type', def.kind === 'integer' ? 'number' : 'text');
        input.setAttribute('aria-label', `${def.key} value`);
        input.addEventListener('change', () => this.commitText(def.key, (input as HTMLInputElement).value));
        label.setAttribute('for', input.id);
        row.appendChild(input);
      }
      this.rowsEl.appendChild(row);
    }
  }

  private toggleBoolean(key: string): void {
    const current = this.deps.getRules()[key as GameRuleKey];
    const applied = this.deps.setRule(key, current === true ? 'false' : 'true');
    this.status = applied
      ? `${key} set to ${current === true ? 'false' : 'true'}.`
      : `${key}: change rejected — value unchanged.`;
    if (applied) this.deps.onChanged();
    this.lastRenderKey = '\0';
    this.render();
  }

  private commitText(key: string, text: string): void {
    const applied = this.deps.setRule(key, text);
    this.status = applied
      ? `${key} set to ${text.trim() === '' ? '(empty)' : text}.`
      : `${key}: '${text}' is not a valid value — value unchanged.`;
    if (applied) this.deps.onChanged();
    this.lastRenderKey = '\0';
    this.render();
  }

  private renderSignature(rules: GameRuleStore): string {
    return gameRuleDefinitions()
      .map((def) => `${def.key}=${String(rules[def.key as GameRuleKey])}`)
      .join('|');
  }

  private static ownerDocument(): Document {
    return globalThis.document as unknown as Document;
  }
}
