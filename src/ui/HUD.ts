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
  /** Test-only overrides (245): when set, dynamic chips render these constants. */
  private fixedFpsText: string | null = null;
  private fixedWorldTimeText: string | null = null;
  /** Last text assigned per chip; identical re-renders skip the DOM write. */
  private lastFpsText: string | null = null;
  private lastSelectedName: string | null = null;
  private lastHealthText: string | null = null;
  private lastHungerText: string | null = null;
  private lastWorldTimeText: string | null = null;

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
      const text = this.fixedFpsText ?? `${Math.round(fps)} FPS`;
      if (text !== this.lastFpsText) {
        this.fpsCounter.textContent = text;
        this.lastFpsText = text;
      }
    }
  }

  /** Update the selected-block-name chip. */
  setSelectedName(name: string): void {
    if (this.selectedName && name !== this.lastSelectedName) {
      this.selectedName.textContent = name;
      this.lastSelectedName = name;
    }
  }

  /** Update survival bars in compact numeric form for readability. */
  setSurvival(health: number, hunger: number): void {
    if (this.healthStatus) {
      const text = `♥ ${Math.max(0, Math.ceil(health))}`;
      if (text !== this.lastHealthText) {
        this.healthStatus.textContent = text;
        this.lastHealthText = text;
      }
    }
    if (this.hungerStatus) {
      const text = `🍗 ${Math.max(0, Math.ceil(hunger))}`;
      if (text !== this.lastHungerText) {
        this.hungerStatus.textContent = text;
        this.lastHungerText = text;
      }
    }
  }

  /** Show the current in-world clock without tying gameplay to real time. */
  setWorldTime(hours: number): void {
    if (!this.worldTime) return;
    let text: string;
    if (this.fixedWorldTimeText !== null) {
      text = this.fixedWorldTimeText;
    } else {
      const totalMinutes = Math.floor((((hours % 24) + 24) % 24) * 60);
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const phase = hour >= 6 && hour < 18 ? '☀' : '☾';
      text = `${phase} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    if (text !== this.lastWorldTimeText) {
      this.worldTime.textContent = text;
      this.lastWorldTimeText = text;
    }
  }

  /** Test-only hook (245): pin the dynamic chips to fixed constants. */
  setFixedText(fpsText: string, worldTimeText: string): void {
    this.fixedFpsText = fpsText;
    this.fixedWorldTimeText = worldTimeText;
    if (this.fpsCounter && fpsText !== this.lastFpsText) {
      this.fpsCounter.textContent = fpsText;
      this.lastFpsText = fpsText;
    }
    if (this.worldTime && worldTimeText !== this.lastWorldTimeText) {
      this.worldTime.textContent = worldTimeText;
      this.lastWorldTimeText = worldTimeText;
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
