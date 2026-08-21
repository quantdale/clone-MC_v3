import { describe, expect, it, beforeEach, afterEach } from 'vitest';

// The vitest environment is `node`; DebugOverlay touches only the DOM APIs
// stubbed here (createElement + appendChild + textContent), so a minimal
// document shim installed before importing the module is sufficient.
class FakeElement {
  className = '';
  textContent = '';
  children: FakeElement[] = [];
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

beforeEach(() => {
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: () => new FakeElement(),
  };
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

const { DebugOverlay, formatPerfLine } = await import('../../src/ui/DebugOverlay');
type DebugStats = import('../../src/ui/DebugOverlay').DebugStats;

function makeOverlay(): { overlay: import('../../src/ui/DebugOverlay').DebugOverlay; el: FakeElement } {
  const el = new FakeElement();
  const overlay = new DebugOverlay(el as unknown as HTMLElement);
  return { overlay, el };
}

const sampleJson = JSON.stringify({
  frame: { fpsAvg: 59.94, p95Millis: 16.582, p99Millis: 18.234 },
  render: { drawCalls: 142 },
  queues: { depths: { gen: 2, mesh: 1 } },
});

describe('formatPerfLine', () => {
  it('renders a compact fps/p95/p99/draws/queue line', () => {
    expect(formatPerfLine(sampleJson)).toBe(
      'perf: fps=59.9 p95=16.6ms p99=18.2ms draws=142 queue=3',
    );
  });

  it('sums all queue depths', () => {
    const json = JSON.stringify({
      frame: { fpsAvg: 60, p95Millis: 16, p99Millis: 17 },
      render: { drawCalls: 0 },
      queues: { depths: { a: 1, b: 2, c: 3 } },
    });
    expect(formatPerfLine(json)).toContain('queue=6');
  });

  it('returns empty string on malformed or missing data', () => {
    expect(formatPerfLine('not json')).toBe('');
    expect(formatPerfLine('{}')).toBe('');
    expect(formatPerfLine(JSON.stringify({ frame: { fpsAvg: 60 } }))).toBe('');
  });
});

describe('DebugOverlay perf source', () => {
  const stats: DebugStats = {
    position: [1, 2, 3],
    chunk: '0,0',
    loaded: 9,
    pendingGen: 1,
    pendingMesh: 2,
    triangles: 100,
  };

  function legacyBlock(): string[] {
    return [
      'pos: 1.0 2.0 3.0',
      'chunk: 0,0',
      'loaded: 9',
      'pendingGen: 1',
      'pendingMesh: 2',
      'triangles: 100',
    ];
  }

  it('legacy lines are byte-identical without a perf source', () => {
    const { overlay, el } = makeOverlay();
    overlay.update(stats);
    expect((el.children[0] as FakeElement).textContent).toBe(legacyBlock().join('\n'));
    expect((el.children[1] as FakeElement).textContent).toBe('');
  });

  it('appends the perf line while legacy lines stay unchanged', () => {
    const { overlay, el } = makeOverlay();
    overlay.setPerfSource(() => formatPerfLine(sampleJson));
    overlay.update(stats);
    expect((el.children[0] as FakeElement).textContent).toBe(legacyBlock().join('\n'));
    expect((el.children[1] as FakeElement).textContent).toBe(
      `\nperf: fps=59.9 p95=16.6ms p99=18.2ms draws=142 queue=3`,
    );
  });

  it('hides the perf line when the source returns null', () => {
    const { overlay, el } = makeOverlay();
    overlay.setPerfSource(() => null);
    overlay.update(stats);
    expect((el.children[0] as FakeElement).textContent).toBe(legacyBlock().join('\n'));
    expect((el.children[1] as FakeElement).textContent).toBe('');
  });

  it('setFixedText pins the legacy block and suppresses the volatile perf line', () => {
    const { overlay, el } = makeOverlay();
    overlay.setPerfSource(() => 'perf: fps=60.0 p95=16.0ms p99=17.0ms draws=1 queue=0');
    overlay.setFixedText('pinned');
    overlay.update(stats);
    expect((el.children[0] as FakeElement).textContent).toBe('pinned');
    // Pinned mode is the deterministic-capture mode (245 visual matrix): the
    // perf line carries live numbers, so it must be hidden while pinned.
    expect((el.children[1] as FakeElement).textContent).toBe('');
  });
});
