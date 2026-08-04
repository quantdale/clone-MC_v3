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

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Format and write the current stats into the overlay element. */
  update(data: DebugStats): void {
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