import type { DeathPresentation } from '../simulation/DeathRespawnPresentation';

export interface DeathRespawnPanelDeps {
  onContinue(): void;
}

/**
 * Transient death card (280). The panel owns no gameplay state; it renders a
 * normalized presentation and delegates dismissal to Game.
 */
export class DeathRespawnPanel {
  private readonly el: HTMLElement;
  private readonly causeEl: HTMLElement;
  private readonly outcomeEl: HTMLElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly deps: DeathRespawnPanelDeps;
  private lastSignature = '';

  constructor(el: HTMLElement, deps: DeathRespawnPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.causeEl = this.requireElement('death-cause');
    this.outcomeEl = this.requireElement('death-outcome');
    this.actionButton = this.requireElement('death-continue') as HTMLButtonElement;
    this.actionButton.addEventListener('click', () => this.deps.onContinue());
    this.hide();
  }

  show(view: DeathPresentation): void {
    const signature = `${view.cause}|${view.outcome}|${view.actionLabel}`;
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.causeEl.textContent = `Cause: ${view.causeText}`;
      this.outcomeEl.textContent = view.outcomeText;
      this.actionButton.textContent = view.actionLabel;
      this.actionButton.setAttribute('aria-label', view.actionLabel);
    }
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) throw new Error(`Death screen element missing: #${id}`);
    return found;
  }
}
