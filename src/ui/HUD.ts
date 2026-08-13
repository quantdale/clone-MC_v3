/**
 * Head-up display. Wraps the HUD container and updates its chips, showing the
 * current frame rate and the name of the selected block.
 */
export class HUD {
  private readonly el: HTMLElement;
  private readonly fpsCounter: HTMLElement | null;
  private readonly selectedName: HTMLElement | null;
  private readonly healthStatus: HTMLElement | null;
  private readonly hungerStatus: HTMLElement | null;
  private readonly worldTime: HTMLElement | null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.fpsCounter = el.querySelector<HTMLElement>('#fps-counter');
    this.selectedName = el.querySelector<HTMLElement>('#selected-block-name');
    this.healthStatus = el.querySelector<HTMLElement>('#health-status');
    this.hungerStatus = el.querySelector<HTMLElement>('#hunger-status');
    this.worldTime = el.querySelector<HTMLElement>('#world-time');
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

  /** Update survival bars in compact numeric form for readability. */
  setSurvival(health: number, hunger: number): void {
    if (this.healthStatus) {
      this.healthStatus.textContent = `♥ ${Math.max(0, Math.ceil(health))}`;
    }
    if (this.hungerStatus) {
      this.hungerStatus.textContent = `🍗 ${Math.max(0, Math.ceil(hunger))}`;
    }
  }

  /** Show the current in-world clock without tying gameplay to real time. */
  setWorldTime(hours: number): void {
    if (!this.worldTime) return;
    const totalMinutes = Math.floor((((hours % 24) + 24) % 24) * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const phase = hour >= 6 && hour < 18 ? '☀' : '☾';
    this.worldTime.textContent = `${phase} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
