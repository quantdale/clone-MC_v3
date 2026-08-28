/**
 * Loading indicator shown while the world is being generated. Controls the
 * visibility of the loading panel element.
 */
export class LoadingIndicator {
  private readonly el: HTMLElement;
  private readonly progressEl: HTMLElement | null;
  private readonly progressBarEl: HTMLElement | null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.progressEl = el.querySelector<HTMLElement>('.loading-progress');
    this.progressBarEl = el.querySelector<HTMLElement>('#loading-progress-bar');
  }

  /** Show the loading indicator. */
  show(): void {
    this.el.classList.remove('hidden');
  }

  /** Hide the loading indicator. */
  hide(): void {
    this.el.classList.add('hidden');
  }

  /** Update the accessible progress state and visual fill (0–1, clamped). */
  setProgress(value: number): void {
    const progress = Math.max(0, Math.min(1, value));
    const percent = Math.round(progress * 100);
    this.progressEl?.setAttribute('aria-valuenow', String(percent));
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${percent}%`;
    }
  }
}
