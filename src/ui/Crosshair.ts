/**
 * Crosshair UI element. Rendered purely via CSS pseudo-elements on the element
 * itself; this class only controls visibility.
 */
export class Crosshair {
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Show the crosshair. */
  show(): void {
    this.el.classList.remove('hidden');
  }

  /** Hide the crosshair. */
  hide(): void {
    this.el.classList.add('hidden');
  }
}