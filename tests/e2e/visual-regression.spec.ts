import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  allCells,
  goldenPath,
  QUALITY_PROFILES,
  RESOLUTIONS,
  SCREENS,
  type MatrixCell,
} from '../visual/matrix';
import { comparePng, writeDiffPng } from '../visual/goldenCompare';

/**
 * Visual-regression matrix (245).
 *
 * Runs every `(screen, quality, resolution)` cell headlessly against a committed
 * golden PNG under `tests/visual-golden/<environment>/`.
 *
 * Environment variables:
 * - `UPDATE_SNAPSHOTS=1`: seed/refresh goldens instead of comparing (each executed
 *   cell is reported as `updated`). Verify mode (default) never writes goldens and
 *   treats a missing golden as a failing cell.
 * - `SCREEN_FILTER=hud,hotbar`: run only the listed screen ids (all qualities ×
 *   both resolutions); unset runs the full 60-cell matrix.
 * - `VISUAL_GOLDEN_ENV`: explicit baseline-set override; defaults to
 *   `<platform>-ci` under CI and `<platform>-local` elsewhere (see matrix.ts).
 *
 * Provenance: goldens re-pinned after worldgen v2 depth pipeline + four-stream
 * material split (2026-08-22 validation campaign); sets are per-environment since
 * pixel output is renderer/font dependent (2026-08-23 post-250 hardening Gate F).
 *
 * Determinism: fresh context per cell (empty localStorage), fixed seed (?seed=1337),
 * quality profile injected pre-boot via addInitScript (VITE_E2E-only seam), fixed
 * camera pose, day/night clock frozen per screen, dynamic HUD/debug text normalized,
 * fixed settle delay, single worker (playwright.config.ts).
 */

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const SCREEN_FILTER = process.env.SCREEN_FILTER;

/** Fixed settle delay after state assembly so meshing/textures settle. */
const SETTLE_MS = 750;

/** Comparison thresholds per capture mode (fixed constants, see design). */
// maxChangedFraction 0.02: headless software-WebGL sky noise on the largest render cell
// (environment-day/high/1920x1080) measured up to ~0.0105 across runs — right at the old
// 0.01 bound. Real rendering regressions change far more than 2% of pixels; renderer noise
// does not. Raised from the 245 default 0.01 with this evidence (248 session).
const PIXEL_DIFF = { channelTolerance: 24, maxChangedFraction: 0.02 };
// Element-clipped cells previously used byte-exact comparison. The 2026-08-22 validation
// campaign proved that unstable across runs: two independent pin→verify cycles failed
// byte-equality on high-quality clipped cells with changed fractions of 0.000012–0.0107,
// all hugging DOM-text glyph edges (font anti-aliasing varies per capture under software
// rasterization at 1920×1080). Clipped cells therefore use the same channel tolerance as
// full-frame captures with a stricter fraction bound above the measured noise ceiling.
// Structured UI regressions (wrong/missing panel, layout shift) change far more than 1.5%.
const CLIPPED_DIFF = { channelTolerance: 24, maxChangedFraction: 0.015 };

/** Fixed camera pose for every capture. */
const POSE_YAW = 0.6;
const POSE_PITCH = -0.15;

/** Normalized dynamic-text constants. */
const FIXED_FPS = '60 FPS';
const FIXED_TIME = '\u2600 06:00';
const FIXED_DEBUG = [
  'pos: 0.0 0.0 0.0',
  'chunk: 0,0',
  'loaded: 9',
  'pendingGen: 0',
  'pendingMesh: 0',
  'triangles: 123456',
].join('\n');

interface ReportRow {
  screen: string;
  quality: string;
  resolution: string;
  status: 'pass' | 'fail' | 'missing-golden' | 'updated' | 'error';
  changedFraction?: number;
  message?: string;
}

function show(page: Page, selector: string): void {
  void page.evaluate((sel) => {
    document.querySelector(sel)?.classList.remove('hidden');
  }, selector);
}

function hide(page: Page, selector: string): void {
  void page.evaluate((sel) => {
    document.querySelector(sel)?.classList.add('hidden');
  }, selector);
}

/** Assemble the deterministic per-screen state before the settle delay. */
async function assembleState(page: Page, screenId: string): Promise<void> {
  // Fixed camera pose + normalized dynamic text (VITE_E2E hooks, see Game.ts).
  await page.evaluate(
    ({ yaw, pitch, fps, time, debug }) => {
      const game = (
        window as unknown as {
          __voxelGame?: {
            testSetCameraPose(yaw: number, pitch: number): void;
            testNormalizeHud(fps: string, time: string, debug?: string): void;
          };
        }
      ).__voxelGame;
      if (!game) throw new Error('window.__voxelGame is not exposed');
      game.testSetCameraPose(yaw, pitch);
      game.testNormalizeHud(fps, time, debug);
    },
    { yaw: POSE_YAW, pitch: POSE_PITCH, fps: FIXED_FPS, time: FIXED_TIME, debug: FIXED_DEBUG },
  );

  // Per-screen UI reveal/hide. Pre-pointer-lock the game keeps the HUD family
  // hidden, so element-clipped screens force their element visible; the
  // no-hud/environment screens force the HUD family hidden.
  const hideHudFamily = ['render-world-no-hud', 'environment-day', 'environment-night'];
  if (hideHudFamily.includes(screenId)) {
    await hide(page, '#hud');
    await hide(page, '#hotbar');
    await hide(page, '#crosshair');
    await hide(page, '#debug-overlay');
  }

  if (screenId === 'render-world') {
    await show(page, '#hud');
    await show(page, '#hotbar');
    await show(page, '#crosshair');
  } else if (screenId === 'hud') {
    await show(page, '#hud');
  } else if (screenId === 'hotbar') {
    await show(page, '#hotbar');
  } else if (screenId === 'crosshair') {
    await show(page, '#crosshair');
  } else if (screenId === 'debug-overlay') {
    await show(page, '#debug-overlay');
  } else if (screenId === 'start-overlay') {
    await show(page, '#overlay'); // shown pre-lock by default; kept explicit
  } else if (screenId === 'container-ui') {
    await show(page, '#crafting');
  } else if (screenId === 'environment-day') {
    await page.evaluate(() => {
      (
        window as unknown as {
          __voxelGame?: { testFreezeDayNight(daylight: number): void };
        }
      ).__voxelGame?.testFreezeDayNight(1);
    });
  } else if (screenId === 'environment-night') {
    await page.evaluate(() => {
      (
        window as unknown as {
          __voxelGame?: { testFreezeDayNight(daylight: number): void };
        }
      ).__voxelGame?.testFreezeDayNight(0);
    });
  }
}

function artifactsDir(cell: MatrixCell): string {
  return path.join('test-results', 'visual', cell.screen, cell.quality, cell.resolution);
}

test.describe('visual regression matrix (245)', () => {
  // Software WebGL boots slowly; 60 serial cells need far more than the 30s default.
  test.setTimeout(1_800_000);

  test('every matrix cell matches its committed golden', async ({ browser }) => {
    const cells = allCells().filter((cell) => {
      if (!SCREEN_FILTER) return true;
      const wanted = SCREEN_FILTER.split(',').map((s) => s.trim());
      return wanted.includes(cell.screen);
    });
    expect(cells.length).toBeGreaterThan(0);

    const rows: ReportRow[] = [];

    for (const cell of cells) {
      const screen = SCREENS.find((s) => s.id === cell.screen)!;
      const profile = QUALITY_PROFILES.find((q) => q.id === cell.quality)!;
      const resolution = RESOLUTIONS.find((r) => r.id === cell.resolution)!;

      const context = await browser.newContext({
        viewport: { width: resolution.width, height: resolution.height },
      });
      // Inject the quality profile before any page script runs (VITE_E2E seam).
      await context.addInitScript((q) => {
        (window as unknown as { __voxelQualityProfile?: unknown }).__voxelQualityProfile = q;
      }, { renderDistance: profile.renderDistance, fov: profile.fov, brightness: profile.brightness });

      const page = await context.newPage();
      const row: ReportRow = { ...cell, status: 'error' };
      try {
        await page.goto('/?seed=1337');
        await page.waitForSelector('#loading', { state: 'hidden', timeout: 30_000 });
        await assembleState(page, cell.screen);
        await page.waitForTimeout(SETTLE_MS);

        const shot =
          screen.mode === 'element-clipped'
            ? await page.locator(screen.selector!).screenshot()
            : await page.screenshot();

        const goldenRel = goldenPath(cell);
        if (UPDATE) {
          mkdirSync(path.dirname(goldenRel), { recursive: true });
          writeFileSync(goldenRel, shot);
          row.status = 'updated';
        } else {
          const golden = existsSync(goldenRel) ? readFileSync(goldenRel) : null;
          const opts =
            screen.mode === 'element-clipped'
              ? CLIPPED_DIFF
              : PIXEL_DIFF;
          const result = comparePng(shot, golden, opts);
          if (result.status === 'pass') {
            row.status = 'pass';
            row.changedFraction = result.changedFraction;
          } else if (result.status === 'missing-golden') {
            row.status = 'missing-golden';
            row.message = `missing golden: ${goldenRel}`;
          } else {
            row.status = 'fail';
            row.changedFraction = result.changedFraction;
            row.message = `${result.reason} (${goldenRel})`;
            // Persist actual + diff artifacts for inspection.
            const dir = artifactsDir(cell);
            mkdirSync(dir, { recursive: true });
            writeFileSync(path.join(dir, 'actual.png'), shot);
            if (golden && result.reason !== 'decode-error') {
              try {
                writeDiffPng(shot, golden, path.join(dir, 'diff.png'));
              } catch {
                // diff artifact is best-effort; the row already records the failure
              }
            }
          }
        }
      } catch (err) {
        row.status = 'error';
        row.message = err instanceof Error ? err.message : String(err);
      } finally {
        await context.close();
      }
      rows.push(row);
    }

    // Full report: every executed row must be pass (or updated in update mode).
    const acceptable = UPDATE ? ['updated'] : ['pass'];
    const bad = rows.filter((r) => !acceptable.includes(r.status));
    const summary = rows
      .map((r) => `${r.screen}/${r.quality}/${r.resolution}: ${r.status}${r.changedFraction !== undefined ? ` (${r.changedFraction})` : ''}${r.message ? ` — ${r.message}` : ''}`)
      .join('\n');
    expect(bad, `failing visual matrix cells:\n${summary}`).toEqual([]);
    expect(rows.length).toBe(cells.length);
  });
});
