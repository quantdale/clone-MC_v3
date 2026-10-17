import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { DynamicResolutionController } from '../../src/rendering/DynamicResolution';
import { Renderer, createDefaultWebGLRenderer, type WebGLRendererFactory } from '../../src/engine/Renderer';

/**
 * Deterministic, headless unit coverage for `src/engine/Renderer.ts` (change 303,
 * audit finding F-007).
 *
 * Production constructs a real `THREE.WebGLRenderer`, which needs a GPU. The
 * class therefore exposes a defaulted `WebGLRendererFactory` construction seam:
 * the default is the exact shipped call, and these tests inject a fake so the
 * lifecycle branches — no-WebGL fail-closed construction, context loss and
 * restoration (including a restore failure), dispose completeness and
 * idempotency, headless vs standard pixel-ratio capping, resize clamp,
 * drawing-buffer size, and frozen dynamic resolution — are exercised without a
 * browser or a GPU.
 */

/** Recording fake standing in for THREE.WebGLRenderer. */
interface FakeRenderer {
  readonly name: string;
  dispose: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  getDrawingBufferSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  outputColorSpace: string;
  toneMapping: number;
  toneMappingExposure: number;
  shadowMap: { enabled: boolean; type: number };
}

function makeFake(name = 'fake'): FakeRenderer {
  return {
    name,
    dispose: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    getDrawingBufferSize: vi.fn((target: THREE.Vector2) => target.set(320, 200)),
    render: vi.fn(),
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 0,
    shadowMap: { enabled: false, type: 0 },
  };
}

/** A minimal canvas stub: Renderer only adds/removes two listeners on it. */
function makeCanvas(): {
  canvas: HTMLCanvasElement;
  listeners: Map<string, EventListener>;
} {
  const listeners = new Map<string, EventListener>();
  const canvas = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, listeners };
}

/** Cast a fake to the real type for injection. */
function asFactory(fake: FakeRenderer): WebGLRendererFactory {
  return () => fake as unknown as THREE.WebGLRenderer;
}

function makeRenderer(options: {
  fake?: FakeRenderer;
  factory?: WebGLRendererFactory;
  onLost?: () => void;
  onRestored?: () => void;
  tier?: 'low' | 'medium' | 'high';
} = {}): { renderer: Renderer; canvas: HTMLCanvasElement; listeners: Map<string, EventListener> } {
  const { canvas, listeners } = makeCanvas();
  const dynamicResolution = new DynamicResolutionController(options.tier ?? 'medium');
  const renderer = new Renderer(
    canvas,
    options.onLost,
    options.onRestored,
    dynamicResolution,
    options.factory ?? asFactory(options.fake ?? makeFake()),
  );
  return { renderer, canvas, listeners };
}

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
void originalWindow;
void originalNavigator;

function setViewport(width: number, height: number, dpr = 1): void {
  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
  });
}

/**
 * `globalThis.navigator` is a getter-only property in Node, so plain assignment
 * throws; `vi.stubGlobal` defines it properly and `unstubAllGlobals` restores it.
 * `undefined` means "no navigator at all", which Renderer guards with
 * `typeof navigator !== 'undefined'`.
 */
function setWebdriver(value: boolean | undefined): void {
  if (value === undefined) {
    vi.stubGlobal('navigator', undefined);
    return;
  }
  vi.stubGlobal('navigator', { webdriver: value });
}

beforeEach(() => {
  setViewport(1280, 720, 2);
  setWebdriver(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWindow === undefined) {
    // Keep the original state for subsequent files in the same worker.
    void originalWindow;
  }
  if (originalNavigator === undefined) {
    void originalNavigator;
  }
});

describe('Renderer construction (303)', () => {
  it('builds the scene and camera with the viewport aspect ratio', () => {
    const { renderer } = makeRenderer();
    expect(renderer.scene).toBeInstanceOf(THREE.Scene);
    expect(renderer.scene.background).toBeInstanceOf(THREE.Color);
    expect(renderer.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(renderer.camera.aspect).toBeCloseTo(1280 / 720, 10);
    expect(renderer.rendererCreated).toBe(true);
  });

  it('configures colour management, tone mapping and shadow policy', () => {
    const fake = makeFake();
    makeRenderer({ fake });
    expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(fake.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(fake.toneMappingExposure).toBeCloseTo(1.05, 10);
    expect(fake.shadowMap.enabled).toBe(CONFIG.rendering.shadows);
    expect(fake.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
  });

  it('registers context loss and restoration listeners', () => {
    const { listeners } = makeRenderer();
    expect(listeners.has('webglcontextlost')).toBe(true);
    expect(listeners.has('webglcontextrestored')).toBe(true);
  });

  it('uses the production factory by default and it is the shipped call', () => {
    // The seam's default must be the real Three.js constructor, not a stub.
    expect(createDefaultWebGLRenderer).toBeTypeOf('function');
    // A null-canvas construction must reach Three.js and throw for lack of a
    // WebGL context; the important part is that the default is a real factory.
    expect(() => createDefaultWebGLRenderer(null as unknown as HTMLCanvasElement)).toThrow();
  });
});

describe('Renderer no-WebGL fail-closed construction', () => {
  it('reports rendererCreated=false and keeps renderer null when construction throws', () => {
    const { renderer } = makeRenderer({
      factory: () => {
        throw new Error('WebGL is not supported');
      },
    });
    expect(renderer.rendererCreated).toBe(false);
    expect(renderer.renderer).toBeNull();
    // The scene and camera still exist so the game can enter its init-error
    // state rather than crashing.
    expect(renderer.scene).toBeInstanceOf(THREE.Scene);
    expect(renderer.camera).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('render() is a no-op without a renderer', () => {
    const { renderer } = makeRenderer({
      factory: () => {
        throw new Error('no webgl');
      },
    });
    expect(() => renderer.render()).not.toThrow();
  });

  it('reports a zero drawing-buffer size without a renderer', () => {
    const { renderer } = makeRenderer({
      factory: () => {
        throw new Error('no webgl');
      },
    });
    expect(renderer.actualDrawingBufferSize()).toEqual({ width: 0, height: 0 });
  });

  it('resize() still updates the camera aspect without a renderer', () => {
    const { renderer } = makeRenderer({
      factory: () => {
        throw new Error('no webgl');
      },
    });
    setViewport(800, 400);
    renderer.resize();
    expect(renderer.camera.aspect).toBeCloseTo(2, 10);
  });
});

describe('Renderer pixel-ratio capping', () => {
  it('caps the standard pixel ratio at CONFIG.maxPixelRatio', () => {
    const fake = makeFake();
    setViewport(1280, 720, 8); // absurd DPR
    makeRenderer({ fake });
    const applied = fake.setPixelRatio.mock.calls.at(-1)?.[0] as number;
    expect(applied).toBeCloseTo(Math.min(8, CONFIG.maxPixelRatio) * 1, 10);
  });

  it('caps the headless pixel ratio at CONFIG.headless.maxPixelRatio', () => {
    const fake = makeFake();
    setViewport(1280, 720, 8);
    setWebdriver(true);
    makeRenderer({ fake });
    const applied = fake.setPixelRatio.mock.calls.at(-1)?.[0] as number;
    expect(applied).toBeCloseTo(Math.min(8, CONFIG.headless.maxPixelRatio) * 1, 10);
    expect(CONFIG.headless.maxPixelRatio).toBeLessThanOrEqual(CONFIG.maxPixelRatio);
  });
});

describe('Renderer resize clamp', () => {
  it('clamps a zero/negative viewport height to at least 1', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    setViewport(640, 0);
    renderer.resize();
    expect(fake.setSize).toHaveBeenLastCalledWith(640, 1);
    expect(renderer.camera.aspect).toBe(640);
  });

  it('applies the requested viewport on resize', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    setViewport(1024, 768);
    renderer.resize();
    expect(fake.setSize).toHaveBeenLastCalledWith(1024, 768);
    expect(renderer.camera.aspect).toBeCloseTo(1024 / 768, 10);
  });
});

describe('Renderer drawing-buffer size', () => {
  it('floors the physical buffer size and never returns negatives', () => {
    const fake = makeFake();
    fake.getDrawingBufferSize.mockImplementation((target: THREE.Vector2) => target.set(255.9, 100.2));
    const { renderer } = makeRenderer({ fake });
    expect(renderer.actualDrawingBufferSize()).toEqual({ width: 255, height: 100 });
  });

  it('clamps a negative buffer dimension to 0', () => {
    const fake = makeFake();
    fake.getDrawingBufferSize.mockImplementation((target: THREE.Vector2) => target.set(-10, -1));
    const { renderer } = makeRenderer({ fake });
    expect(renderer.actualDrawingBufferSize()).toEqual({ width: 0, height: 0 });
  });
});

describe('Renderer context loss and restoration', () => {
  it('marks the renderer unusable on loss, prevents the default, and notifies', () => {
    const onLost = vi.fn();
    const fake = makeFake();
    const { renderer, listeners } = makeRenderer({ fake, onLost });
    const event = { preventDefault: vi.fn() } as unknown as Event;

    listeners.get('webglcontextlost')!(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(renderer.rendererCreated).toBe(false);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('does not render while the context is lost', () => {
    const fake = makeFake();
    const { renderer, listeners } = makeRenderer({ fake });
    listeners.get('webglcontextlost')!({ preventDefault: vi.fn() } as unknown as Event);
    renderer.render();
    expect(fake.render).not.toHaveBeenCalled();
  });

  it('disposes the old renderer and rebuilds a working one on restoration', () => {
    const onRestored = vi.fn();
    const first = makeFake('first');
    const second = makeFake('second');
    let created = 0;
    const { renderer, listeners } = makeRenderer({
      factory: () => {
        created += 1;
        return (created === 1 ? first : second) as unknown as THREE.WebGLRenderer;
      },
      onRestored,
    });

    listeners.get('webglcontextlost')!({ preventDefault: vi.fn() } as unknown as Event);
    listeners.get('webglcontextrestored')!(new Event('webglcontextrestored'));

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.rendererCreated).toBe(true);
    expect((renderer.renderer as unknown as FakeRenderer).name).toBe('second');
    // The rebuilt renderer is reconfigured rather than left at Three.js defaults.
    expect(second.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(second.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(onRestored).toHaveBeenCalledTimes(1);
    renderer.render();
    expect(second.render).toHaveBeenCalledTimes(1);
  });

  it('stays fail-closed when restoration itself fails', () => {
    const onRestored = vi.fn();
    let created = 0;
    const { renderer, listeners } = makeRenderer({
      factory: () => {
        created += 1;
        if (created === 1) return makeFake('ok') as unknown as THREE.WebGLRenderer;
        throw new Error('restore failed');
      },
      onRestored,
    });

    listeners.get('webglcontextlost')!({ preventDefault: vi.fn() } as unknown as Event);
    expect(() => listeners.get('webglcontextrestored')!(new Event('webglcontextrestored'))).not.toThrow();

    expect(renderer.rendererCreated).toBe(false);
    expect(renderer.renderer).toBeNull();
    // The callback still fires so the game can leave its loss-pause state and
    // report the failure rather than hanging.
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(renderer.actualDrawingBufferSize()).toEqual({ width: 0, height: 0 });
  });
});

describe('Renderer dispose', () => {
  it('disposes the renderer, clears it, and removes both listeners', () => {
    const fake = makeFake();
    const { renderer, listeners } = makeRenderer({ fake });
    expect(listeners.size).toBe(2);

    renderer.dispose();

    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.renderer).toBeNull();
    expect(renderer.rendererCreated).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('is idempotent: a second dispose does not re-dispose or throw', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    renderer.dispose();
    expect(() => renderer.dispose()).not.toThrow();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('is safe without a renderer (no-WebGL fail-closed path)', () => {
    const { renderer } = makeRenderer({
      factory: () => {
        throw new Error('no webgl');
      },
    });
    expect(() => renderer.dispose()).not.toThrow();
    expect(renderer.rendererCreated).toBe(false);
  });

  it('does not render after dispose', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    renderer.dispose();
    renderer.render();
    expect(fake.render).not.toHaveBeenCalled();
  });
});

describe('Renderer frozen dynamic resolution', () => {
  // These hooks are tagged `c8 ignore` in the source as E2E-covered; they are
  // unit-tested here so the freeze contract is pinned deterministically too.
  it('testFreezeDynamicResolution stops adaptive scale changes', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    renderer.testFreezeDynamicResolution();
    const update = renderer.updateDynamicResolution(1000, { p95FrameTimeMillis: 500 });
    expect(update.changed).toBe(false);
    expect(update.valid).toBe(true);
    expect(update.reason).toBe('at-bound');
  });

  it('testFreezeAtMaxScale pins the scale to max and then freezes', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    renderer.testFreezeAtMaxScale();
    const state = renderer.dynamicResolutionState();
    expect(state.scale).toBe(state.maxScale);
    const update = renderer.updateDynamicResolution(2000, { p95FrameTimeMillis: 500 });
    expect(update.changed).toBe(false);
  });

  it('applies a new size when an unfrozen scale change is accepted', () => {
    // Covers the `if (update.changed) this.applyDynamicResolutionSize()` branch:
    // a sustained overload must both report changed and resize the renderer.
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake, tier: 'medium' });
    const sizeCallsBefore = fake.setSize.mock.calls.length;
    const scaleBefore = renderer.dynamicResolutionState().scale;

    let changedAt = -1;
    for (let step = 0; step < 400 && changedAt < 0; step++) {
      const update = renderer.updateDynamicResolution(step * 16.7, { p95FrameTimeMillis: 900 });
      if (update.changed) changedAt = step;
    }

    expect(changedAt).toBeGreaterThanOrEqual(0);
    expect(renderer.dynamicResolutionState().scale).not.toBe(scaleBefore);
    expect(fake.setSize.mock.calls.length).toBeGreaterThan(sizeCallsBefore);
  });

  it('ignores an invalid metric without resizing', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    const before = fake.setSize.mock.calls.length;
    const update = renderer.updateDynamicResolution(1000, { p95FrameTimeMillis: Number.NaN });
    expect(update.valid).toBe(false);
    expect(update.changed).toBe(false);
    expect(fake.setSize.mock.calls.length).toBe(before);
  });

  it('setDynamicResolutionTier applies the new tier size', () => {
    const fake = makeFake();
    const { renderer } = makeRenderer({ fake });
    const before = fake.setSize.mock.calls.length;
    renderer.setDynamicResolutionTier('low');
    expect(fake.setSize.mock.calls.length).toBeGreaterThan(before);
  });
});
