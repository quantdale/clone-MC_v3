import { describe, it, expect } from 'vitest';
import {
  SCREENS,
  QUALITY_PROFILES,
  RESOLUTIONS,
  allCells,
  goldenPath,
  validateMatrix,
  validateScreens,
  validateProfiles,
  validateResolutions,
  type ScreenDef,
  type QualityProfile,
  type Resolution,
} from '../visual/matrix';

const HUD_SCREEN_IDS = ['hud', 'hotbar', 'crosshair', 'debug-overlay', 'start-overlay'] as const;

const EXPECTED_SELECTORS: Record<string, string> = {
  hud: '#hud',
  hotbar: '#hotbar',
  crosshair: '#crosshair',
  'debug-overlay': '#debug-overlay',
  'start-overlay': '#overlay',
  'container-ui': '#crafting',
};

function screenById(id: string): ScreenDef {
  const screen = SCREENS.find((s) => s.id === id);
  expect(screen).toBeDefined();
  return screen as ScreenDef;
}

describe('screens', () => {
  it('contains exactly the ten documented screens', () => {
    expect(SCREENS.map((s) => s.id)).toEqual([
      'render-world',
      'render-world-no-hud',
      'hud',
      'hotbar',
      'crosshair',
      'debug-overlay',
      'start-overlay',
      'container-ui',
      'environment-day',
      'environment-night',
    ]);
  });

  it('defines the render screens as full-viewport with HUD normalization', () => {
    for (const id of ['render-world', 'render-world-no-hud']) {
      const screen = screenById(id);
      expect(screen.family).toBe('render');
      expect(screen.mode).toBe('full-viewport');
      expect(screen.normalize).toEqual(['#fps-counter', '#world-time']);
    }
  });

  it('defines the hud screens as element-clipped with non-empty selectors', () => {
    for (const id of HUD_SCREEN_IDS) {
      const screen = screenById(id);
      expect(screen.family).toBe('hud');
      expect(screen.mode).toBe('element-clipped');
      expect(screen.selector).toBe(EXPECTED_SELECTORS[id]);
      expect(screen.selector!.length).toBeGreaterThan(0);
    }
  });

  it('normalizes the dynamic fps/time/debug elements on hud screens', () => {
    for (const id of HUD_SCREEN_IDS) {
      const expected = id === 'debug-overlay'
        ? ['#fps-counter', '#world-time', '#debug-overlay']
        : ['#fps-counter', '#world-time'];
      expect(screenById(id).normalize).toEqual(expected);
    }
  });

  it('defines the inventory screen as element-clipped with a selector', () => {
    const screen = screenById('container-ui');
    expect(screen.family).toBe('inventory');
    expect(screen.mode).toBe('element-clipped');
    expect(screen.selector).toBe('#crafting');
  });

  it('defines the environment screens as full-viewport', () => {
    for (const id of ['environment-day', 'environment-night']) {
      const screen = screenById(id);
      expect(screen.family).toBe('environment');
      expect(screen.mode).toBe('full-viewport');
    }
  });

  it('has unique screen ids', () => {
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(SCREENS.length);
  });
});

describe('quality profiles', () => {
  it('contains exactly low, default, and high with the documented values', () => {
    expect(QUALITY_PROFILES).toEqual([
      { id: 'low', renderDistance: 2, fov: 70, brightness: 0.3 },
      { id: 'default', renderDistance: 2, fov: 75, brightness: 0.5 },
      { id: 'high', renderDistance: 4, fov: 90, brightness: 0.8 },
    ]);
  });

  it('has unique profile ids', () => {
    expect(new Set(QUALITY_PROFILES.map((p) => p.id)).size).toBe(QUALITY_PROFILES.length);
  });
});

describe('resolutions', () => {
  it('contains exactly 1280x720 and 1920x1080 with the documented dimensions', () => {
    expect(RESOLUTIONS).toEqual([
      { id: '1280x720', width: 1280, height: 720 },
      { id: '1920x1080', width: 1920, height: 1080 },
    ]);
  });

  it('uses 16:9 aspect ratios', () => {
    for (const resolution of RESOLUTIONS) {
      expect(resolution.width / resolution.height).toBe(16 / 9);
    }
  });
});

describe('cells and golden paths', () => {
  it('enumerates the full 60-cell cross-product in screens × qualities × resolutions order', () => {
    const cells = allCells();
    expect(cells).toHaveLength(10 * 3 * 2);

    const expected: Array<{ screen: string; quality: string; resolution: string }> = [];
    for (const screen of SCREENS) {
      for (const quality of QUALITY_PROFILES) {
        for (const resolution of RESOLUTIONS) {
          expected.push({ screen: screen.id, quality: quality.id, resolution: resolution.id });
        }
      }
    }
    expect(cells).toEqual(expected);

    // Exactly one entry per combination.
    const keys = cells.map((c) => `${c.screen}|${c.quality}|${c.resolution}`);
    expect(new Set(keys).size).toBe(60);
    expect(cells[0]).toEqual({ screen: 'render-world', quality: 'low', resolution: '1280x720' });
    expect(cells[59]).toEqual({ screen: 'environment-night', quality: 'high', resolution: '1920x1080' });
  });

  it('is deterministic across calls', () => {
    expect(allCells()).toEqual(allCells());
  });

  it('derives the documented golden path', () => {
    expect(goldenPath({ screen: 'render-world', quality: 'high', resolution: '1920x1080' })).toBe(
      'tests/visual-golden/render-world/high/1920x1080.png',
    );
  });

  it('derives a stable path for every enumerated cell', () => {
    for (const cell of allCells()) {
      expect(goldenPath(cell)).toBe(
        `tests/visual-golden/${cell.screen}/${cell.quality}/${cell.resolution}.png`,
      );
    }
  });
});

describe('validation', () => {
  it('accepts the shipped manifest without throwing', () => {
    expect(() => validateMatrix()).not.toThrow();
    expect(validateMatrix()).toEqual([]);
  });

  it('detects duplicate screen ids', () => {
    const hud = screenById('hud');
    const defects = validateScreens([hud, hud]);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.join(' ')).toMatch(/duplicate screen id 'hud'/);
  });

  it('detects missing and empty selectors on element-clipped screens', () => {
    const missing = validateScreens([{ id: 'no-selector', family: 'hud', mode: 'element-clipped' }]);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.join(' ')).toMatch(/'no-selector'/);
    expect(missing.join(' ')).toMatch(/selector/i);

    const empty = validateScreens([{ id: 'empty-selector', family: 'inventory', mode: 'element-clipped', selector: '' }]);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.join(' ')).toMatch(/'empty-selector'/);
  });

  it('detects family/mode pairing violations', () => {
    const renderClipped = validateScreens([{ id: 'bad-render', family: 'render', mode: 'element-clipped' }]);
    expect(renderClipped.length).toBeGreaterThan(0);
    expect(renderClipped.join(' ')).toMatch(/'bad-render'/);

    const envClipped = validateScreens([{ id: 'bad-env', family: 'environment', mode: 'element-clipped' }]);
    expect(envClipped.length).toBeGreaterThan(0);
    expect(envClipped.join(' ')).toMatch(/'bad-env'/);

    const hudViewport = validateScreens([{ id: 'bad-hud', family: 'hud', mode: 'full-viewport' }]);
    expect(hudViewport.length).toBeGreaterThan(0);
    expect(hudViewport.join(' ')).toMatch(/'bad-hud'/);

    const invViewport = validateScreens([{ id: 'bad-inv', family: 'inventory', mode: 'full-viewport' }]);
    expect(invViewport.length).toBeGreaterThan(0);
    expect(invViewport.join(' ')).toMatch(/'bad-inv'/);
  });

  it('detects duplicate profile ids', () => {
    const low = QUALITY_PROFILES[0]!;
    const defects = validateProfiles([low, low]);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.join(' ')).toMatch(/duplicate quality profile id 'low'/);
  });

  it('detects out-of-range profile values naming the profile', () => {
    const base: QualityProfile = { id: 'default', renderDistance: 2, fov: 75, brightness: 0.5 };
    const variants: Array<QualityProfile> = [
      { ...base, renderDistance: 33 },
      { ...base, renderDistance: 1 },
      { ...base, renderDistance: 2.5 },
      { ...base, fov: 29 },
      { ...base, fov: 111 },
      { ...base, fov: 75.5 },
      { ...base, brightness: 1.5 },
      { ...base, brightness: -0.1 },
      { ...base, brightness: Number.NaN },
    ];
    for (const variant of variants) {
      const defects = validateProfiles([variant]);
      expect(defects.length).toBeGreaterThan(0);
      expect(defects.join(' ')).toMatch(/'default'/);
    }
  });

  it('accepts boundary profile values', () => {
    const bounds: QualityProfile[] = [
      { id: 'low', renderDistance: 2, fov: 30, brightness: 0 },
      { id: 'high', renderDistance: 32, fov: 110, brightness: 1 },
    ];
    expect(validateProfiles(bounds)).toEqual([]);
  });

  it('detects duplicate resolution ids', () => {
    const first = RESOLUTIONS[0]!;
    const defects = validateResolutions([first, first]);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.join(' ')).toMatch(new RegExp(`duplicate resolution id '${first.id}'`));
  });

  it('detects non-16:9 resolutions naming the offender', () => {
    const square: Resolution = { id: '1000x1000', width: 1000, height: 1000 };
    const defects = validateResolutions([square]);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.join(' ')).toMatch(/'1000x1000'/);
  });
});
