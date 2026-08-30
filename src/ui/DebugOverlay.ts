/** Snapshot of debug stats reported to the overlay. */
export interface DebugStats {
  position: number[];
  chunk: string;
  loaded: number;
  /** Canonical horizontal column residency, shown as additive diagnostics. */
  columns?: number;
  /** Canonical materialized section count, shown as additive diagnostics. */
  sections?: number;
  pendingGen: number;
  pendingMesh: number;
  triangles: number;
}

/**
 * Compact single-line summary from `RenderPerformanceMonitor.exportJSON()`:
 * fps / p95 / p99 frame times + draw calls + total worker-queue depth.
 * Returns an empty string when the JSON cannot be parsed (line is hidden).
 *
 * Phase 11.5 wiring note: Game composes this with
 * `overlay.setPerfSource(() => formatPerfLine(monitor.exportJSON()))`
 * — a one-line change next to the existing DebugOverlay construction.
 */
export function formatPerfLine(json: string): string {
  let d: unknown;
  try {
    d = JSON.parse(json) as unknown;
  } catch {
    return '';
  }
  const obj = (d ?? {}) as {
    frame?: { fpsAvg?: unknown; p95Millis?: unknown; p99Millis?: unknown };
    render?: { drawCalls?: unknown };
    queues?: { depths?: Record<string, unknown> };
    pipeline?: {
      ready?: { cpuCompletionMillis?: unknown };
      upload?: { active?: unknown; bytesThisFrame?: unknown; actualMillis?: unknown };
    };
  };
  const fpsAvg = Number(obj.frame?.fpsAvg);
  const p95 = Number(obj.frame?.p95Millis);
  const p99 = Number(obj.frame?.p99Millis);
  const draws = Number(obj.render?.drawCalls);
  const depths = obj.queues?.depths;
  let queue = 0;
  if (depths && typeof depths === 'object') {
    for (const v of Object.values(depths)) {
      queue += Number(v) || 0;
    }
  }
  if (!Number.isFinite(fpsAvg) || !Number.isFinite(p95) || !Number.isFinite(p99) || !Number.isFinite(draws)) {
    return '';
  }
  const pipeline = obj.pipeline;
  if (pipeline === undefined) {
    return `perf: fps=${fpsAvg.toFixed(1)} p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms draws=${draws} queue=${queue}`;
  }
  const cpuReady = pipeline.ready?.cpuCompletionMillis;
  const upload = pipeline.upload;
  const uploadBytes = Number(upload?.bytesThisFrame);
  const uploadMillis = upload?.actualMillis;
  const cpuReadyText = typeof cpuReady === 'number' && Number.isFinite(cpuReady)
    ? `${cpuReady.toFixed(1)}ms`
    : 'n/a';
  const uploadBytesText = Number.isFinite(uploadBytes) ? String(uploadBytes) : 'n/a';
  const uploadMillisText = typeof uploadMillis === 'number' && Number.isFinite(uploadMillis)
    ? `${uploadMillis.toFixed(1)}ms`
    : 'n/a';
  return `perf: fps=${fpsAvg.toFixed(1)} p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms draws=${draws} queue=${queue} cpu-ready=${cpuReadyText} gpu-upload=bytes:${uploadBytesText},time:${uploadMillisText}`;
}

/**
 * Debug overlay. Renders a monospace block of engine stats into the element
 * and can be toggled on/off with the `hidden` class.
 *
 * The legacy stats block and the optional perf line live in separate child
 * spans, so adding/perf content never perturbs the pinned legacy text that
 * e2e specs assert against.
 */
export class DebugOverlay {
  private readonly el: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly perfEl: HTMLElement;
  /** Test-only override (245): when set, update() renders this constant block. */
  private fixedText: string | null = null;
  /** Optional Phase 11.5 perf source; returns the formatted perf line or null. */
  private getSummary: (() => string | null) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.statsEl = document.createElement('span');
    this.perfEl = document.createElement('span');
    this.perfEl.className = 'debug-perf-line';
    el.appendChild(this.statsEl);
    el.appendChild(this.perfEl);
  }

  /**
   * Phase 11.5: register an optional performance-summary source. When set,
   * update() appends one compact perf line below the legacy stats block;
   * returning null hides the line. Purely additive — legacy lines are
   * byte-identical whether or not a source is registered.
   */
  setPerfSource(getSummary: () => string | null): void {
    this.getSummary = getSummary;
  }

  /** Format and write the current stats into the overlay element. */
  update(data: DebugStats): void {
    if (this.fixedText !== null) {
      this.statsEl.textContent = this.fixedText;
    } else {
      const [x, y, z] = data.position;
      const canonicalLines = [];
      if (data.columns !== undefined) canonicalLines.push(`columns: ${data.columns}`);
      if (data.sections !== undefined) canonicalLines.push(`sections: ${data.sections}`);
      this.statsEl.textContent = [
        `pos: ${formatNum(x)} ${formatNum(y)} ${formatNum(z)}`,
        `chunk: ${data.chunk}`,
        `loaded: ${data.loaded}`,
        ...canonicalLines,
        `pendingGen: ${data.pendingGen}`,
        `pendingMesh: ${data.pendingMesh}`,
        `triangles: ${data.triangles}`,
      ].join('\n');
    }
    const summary =
      this.getSummary !== null && this.fixedText === null ? this.getSummary() : null;
    this.perfEl.textContent = summary !== null && summary !== '' ? `\n${summary}` : '';
  }

  /** Test-only hook (245): pin the stats block to a fixed constant. */
  setFixedText(text: string): void {
    this.fixedText = text;
    this.statsEl.textContent = text;
    // Pinned mode is the deterministic-capture mode: a live perf line would
    // vary per frame, so it is suppressed while fixed text is active.
    this.perfEl.textContent = '';
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