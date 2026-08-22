/**
 * Visual-regression matrix manifest: the single source of truth for the capture
 * matrix (screens, quality profiles, resolutions), the derived cell enumeration,
 * golden storage paths, and manifest validation.
 *
 * Pure and headless-safe: constants and functions only, no I/O, no global state,
 * no mutation of inputs. The capture harness and comparison utility read their
 * configuration exclusively from this module. The single deliberate environment
 * seam is the optional default source of `resolveGoldenEnvironment()` (process
 * env/platform), mirroring how the e2e harness owns `UPDATE_SNAPSHOTS`/`
 * SCREEN_FILTER`; every function stays pure over explicit arguments.
 *
 * Environment-scoped goldens (2026-08-23 amendment, post-250 hardening Gate F):
 * pixel output is renderer/font-environment dependent, so each verification
 * environment compares against a baseline pinned in that same environment.
 * Goldens live under `tests/visual-golden/<environment-key>/…`; thresholds,
 * cell count, and update-mode semantics are unchanged.
 */

export type ScreenFamily = 'render' | 'hud' | 'inventory' | 'environment';
export type CaptureMode = 'full-viewport' | 'element-clipped';

export interface ScreenDef {
  readonly id: string;
  readonly family: ScreenFamily;
  readonly mode: CaptureMode;
  readonly selector?: string;
  readonly normalize?: string[];
}

export interface QualityProfile {
  readonly id: 'low' | 'default' | 'high';
  readonly renderDistance: number;
  readonly fov: number;
  readonly brightness: number;
}

export interface Resolution {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface MatrixCell {
  readonly screen: string;
  readonly quality: string;
  readonly resolution: string;
}

/** Dynamic HUD elements normalized (masked) during capture. */
const HUD_NORMALIZE = ['#fps-counter', '#world-time'] as const;

/** The 10 documented screens across the render/hud/inventory/environment families. */
export const SCREENS: readonly ScreenDef[] = [
  { id: 'render-world', family: 'render', mode: 'full-viewport', normalize: [...HUD_NORMALIZE] },
  { id: 'render-world-no-hud', family: 'render', mode: 'full-viewport', normalize: [...HUD_NORMALIZE] },
  { id: 'hud', family: 'hud', mode: 'element-clipped', selector: '#hud', normalize: [...HUD_NORMALIZE] },
  { id: 'hotbar', family: 'hud', mode: 'element-clipped', selector: '#hotbar', normalize: [...HUD_NORMALIZE] },
  { id: 'crosshair', family: 'hud', mode: 'element-clipped', selector: '#crosshair', normalize: [...HUD_NORMALIZE] },
  {
    id: 'debug-overlay',
    family: 'hud',
    mode: 'element-clipped',
    selector: '#debug-overlay',
    normalize: ['#fps-counter', '#world-time', '#debug-overlay'],
  },
  { id: 'start-overlay', family: 'hud', mode: 'element-clipped', selector: '#overlay', normalize: [...HUD_NORMALIZE] },
  { id: 'container-ui', family: 'inventory', mode: 'element-clipped', selector: '#crafting' },
  { id: 'environment-day', family: 'environment', mode: 'full-viewport' },
  { id: 'environment-night', family: 'environment', mode: 'full-viewport' },
];

/** The three named quality-setting profiles. */
export const QUALITY_PROFILES: readonly QualityProfile[] = [
  { id: 'low', renderDistance: 2, fov: 70, brightness: 0.3 },
  { id: 'default', renderDistance: 2, fov: 75, brightness: 0.5 },
  { id: 'high', renderDistance: 4, fov: 90, brightness: 0.8 },
];

/** The two captured viewports, both 16:9. */
export const RESOLUTIONS: readonly Resolution[] = [
  { id: '1280x720', width: 1280, height: 720 },
  { id: '1920x1080', width: 1920, height: 1080 },
];

/** Enumerates the full screens × qualities × resolutions cross-product (60 cells). */
export function allCells(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const screen of SCREENS) {
    for (const quality of QUALITY_PROFILES) {
      for (const resolution of RESOLUTIONS) {
        cells.push({ screen: screen.id, quality: quality.id, resolution: resolution.id });
      }
    }
  }
  return cells;
}

/** Legal golden-environment key: one path segment, filesystem-safe, non-empty. */
const GOLDEN_ENV_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** The environment inputs the golden-environment key may be derived from. */
export interface GoldenEnvironmentSource {
  /** Explicit override; wins over every default when a non-empty string. */
  readonly VISUAL_GOLDEN_ENV?: string;
  /** CI marker (`"true"`/`"1"` on hosted runners). */
  readonly CI?: string;
  /** Operating-system platform of the rendering environment. */
  readonly platform?: string;
}

function defaultGoldenEnvironmentSource(): GoldenEnvironmentSource {
  return {
    VISUAL_GOLDEN_ENV: typeof process !== 'undefined' ? process.env.VISUAL_GOLDEN_ENV : undefined,
    CI: typeof process !== 'undefined' ? process.env.CI : undefined,
    platform: typeof process !== 'undefined' ? process.platform : undefined,
  };
}

/**
 * Resolves the committed golden set the current run compares against.
 *
 * A non-empty `VISUAL_GOLDEN_ENV` wins verbatim (validated); otherwise the key
 * is `<platform>-ci` under CI and `<platform>-local` elsewhere. Pure over its
 * input; only the optional default source reads process state. Throws naming
 * the value when any resolved key is not a legal path segment — a bad key must
 * never silently redirect captures to an unintended baseline directory.
 */
export function resolveGoldenEnvironment(
  source: GoldenEnvironmentSource = defaultGoldenEnvironmentSource(),
): string {
  const raw = source.VISUAL_GOLDEN_ENV;
  const key = raw !== undefined && raw !== '' ? raw : `${source.platform ?? 'unknown'}-${source.CI ? 'ci' : 'local'}`;
  if (!GOLDEN_ENV_PATTERN.test(key)) {
    throw new Error(`VisualMatrix: invalid golden environment key '${key}'`);
  }
  return key;
}

/**
 * Derives the deterministic golden storage path for a cell inside the given
 * golden environment (default: the resolved current environment).
 */
export function goldenPath(cell: MatrixCell, environment?: string): string {
  const env = environment ?? resolveGoldenEnvironment();
  return `tests/visual-golden/${env}/${cell.screen}/${cell.quality}/${cell.resolution}.png`;
}

/** Validates arbitrary screens; returns human-readable defects naming each offender. */
export function validateScreens(screens: readonly ScreenDef[]): string[] {
  const defects: string[] = [];
  const seen = new Set<string>();
  for (const screen of screens) {
    if (seen.has(screen.id)) {
      defects.push(`duplicate screen id '${screen.id}'`);
    }
    seen.add(screen.id);
    if (screen.mode === 'element-clipped' && (!screen.selector || screen.selector.length === 0)) {
      defects.push(`element-clipped screen '${screen.id}' must have a non-empty selector`);
    }
    const requiredMode: CaptureMode =
      screen.family === 'render' || screen.family === 'environment' ? 'full-viewport' : 'element-clipped';
    if (screen.mode !== requiredMode) {
      defects.push(
        `screen '${screen.id}' with family '${screen.family}' must use mode '${requiredMode}', got '${screen.mode}'`,
      );
    }
  }
  return defects;
}

/** Validates arbitrary quality profiles; returns human-readable defects naming each offender. */
export function validateProfiles(profiles: readonly QualityProfile[]): string[] {
  const defects: string[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.id)) {
      defects.push(`duplicate quality profile id '${profile.id}'`);
    }
    seen.add(profile.id);
    if (!Number.isInteger(profile.renderDistance) || profile.renderDistance < 2 || profile.renderDistance > 32) {
      defects.push(`quality profile '${profile.id}' renderDistance must be an integer in [2, 32], got ${profile.renderDistance}`);
    }
    if (!Number.isInteger(profile.fov) || profile.fov < 30 || profile.fov > 110) {
      defects.push(`quality profile '${profile.id}' fov must be an integer in [30, 110], got ${profile.fov}`);
    }
    if (!Number.isFinite(profile.brightness) || profile.brightness < 0 || profile.brightness > 1) {
      defects.push(`quality profile '${profile.id}' brightness must be a finite number in [0, 1], got ${profile.brightness}`);
    }
  }
  return defects;
}

/** Validates arbitrary resolutions; returns human-readable defects naming each offender. */
export function validateResolutions(resolutions: readonly Resolution[]): string[] {
  const defects: string[] = [];
  const seen = new Set<string>();
  for (const resolution of resolutions) {
    if (seen.has(resolution.id)) {
      defects.push(`duplicate resolution id '${resolution.id}'`);
    }
    seen.add(resolution.id);
    if (resolution.width / resolution.height !== 16 / 9) {
      defects.push(
        `resolution '${resolution.id}' (${resolution.width}x${resolution.height}) must have a 16:9 aspect ratio`,
      );
    }
  }
  return defects;
}

/** Validates the shipped manifest; returns [] exactly when every invariant holds. Never throws. */
export function validateMatrix(): string[] {
  return [
    ...validateScreens(SCREENS),
    ...validateProfiles(QUALITY_PROFILES),
    ...validateResolutions(RESOLUTIONS),
  ];
}
