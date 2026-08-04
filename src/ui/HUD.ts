/**
 * Head-up display. Wraps the HUD container and updates its chips, showing the
 * current frame rate and the name of the selected block.
 */
export class HUD {
  private readonly el: HTMLElement;
  private readonly fpsCounter: HTMLElement | null;
  private readonly selectedName: HTMLElement | null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.fpsCounter = el.querySelector<HTMLElement>('#fps-counter');
    this.selectedName = el.querySelector<HTMLElement>('#selected-block-name');
  }

  /** Update the FPS counter text. */
  setFPS(fps: number): void {
    if (this.fpsCounter) {
      this.fpsCounter.textContent = `${Math.round(fps)} FPS`;
    }
  }

  /** Update the selected-block-name chip. */
  setSelectedName(name: string): void {
    if (this.selectedName) {
      this.selectedName.textContent = name;
    }
  }

  /** Show the HUD. */
  show(): void {
    this.el.classList.remove('hidden');
  }

  /** Hide the HUD. */
  hide(): void {
    this.el.classList.add('hidden');
  }
}