/**
 * Loading indicator shown while the world is being generated. Controls the
 * visibility of the loading panel element.
 */
export class LoadingIndicator {
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Show the loading indicator. */
  show(): void {
    this.el.classList.remove('hidden');
  }

  /** Hide the loading indicator. */
  hide(): void {
    this.el.classList.add('hidden');
  }
}