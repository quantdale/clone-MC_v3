/** Snapshot of debug stats reported to the overlay. */
export interface DebugStats {
  position: number[];
  chunk: string;
  loaded: number;
  pendingGen: number;
  pendingMesh: number;
  triangles: number;
}

/**
 * Debug overlay. Renders a monospace block of engine stats into the element
 * and can be toggled on/off with the `hidden` class.
 */
export class DebugOverlay {
  private readonly el: HTMLElement;
  /** Test-only override (245): when set, update() renders this constant block. */
  private fixedText: string | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Format and write the current stats into the overlay element. */
  update(data: DebugStats): void {
    if (this.fixedText !== null) {
      this.el.textContent = this.fixedText;
      return;
    }
    const [x, y, z] = data.position;
    this.el.textContent = [
      `pos: ${formatNum(x)} ${formatNum(y)} ${formatNum(z)}`,
      `chunk: ${data.chunk}`,
      `loaded: ${data.loaded}`,
      `pendingGen: ${data.pendingGen}`,
      `pendingMesh: ${data.pendingMesh}`,
      `triangles: ${data.triangles}`,
    ].join('\n');
  }

  /** Test-only hook (245): pin the stats block to a fixed constant. */
  setFixedText(text: string): void {
    this.fixedText = text;
    this.el.textContent = text;
  }

  /** Toggle the overlay's visibility. */
  toggle(): void {
    this.el.classList.toggle('hidden');
  }

  /** Whether the overlay is currently visible. */
  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }
}

function formatNum(value: number | undefined): string {
  return value !== undefined ? value.toFixed(1) : '?';
}