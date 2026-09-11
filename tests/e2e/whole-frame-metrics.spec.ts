import { test, expect, type Page } from '@playwright/test';

/**
 * Whole-frame telemetry live proof (258 tasks 16–23).
 *
 * Boots the real game, verifies the rAF-to-rAF authority accumulates samples
 * without phase timing, then enables the phase timers and verifies Game-level
 * attribution (worldUpdate/renderSubmit) plus World-internal attribution
 * (generation/meshingMain/workerDispatch/lighting/upload/unload), the
 * renderer aux snapshots, worker telemetry, and per-frame work counts.
 * Headless SwiftShader values are non-canonical support evidence only: the
 * test asserts mechanism (samples exist, attribution flows), never thresholds.
 */

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null, {
    timeout: 30_000,
  });
}

test.describe('whole-frame metrics (258)', () => {
  test('rAF authority accumulates samples and phase timing attributes work', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);

    // Interval-only authority: samples accumulate with zeroed phases by default.
    await page.waitForFunction(
      () => {
        const game = (window as unknown as { __voxelGame?: { getWholeFrameStats(): { samples: number } } }).__voxelGame;
        return (game?.getWholeFrameStats().samples ?? 0) >= 5;
      },
      { timeout: 60_000 },
    );
    const before = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { getWholeFrameStats(): unknown } }).__voxelGame;
      return game?.getWholeFrameStats();
    });
    expect(before).toMatchObject({ samples: expect.any(Number) });

    // Enable coarse phase timing: attributed samples must show real work in
    // worldUpdate/renderSubmit while the game keeps running error-free.
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: { setWholeFramePhaseTimingEnabled(e: boolean): void } }).__voxelGame?.setWholeFramePhaseTimingEnabled(true);
    });
    await page.waitForTimeout(5000);
    const phases = await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          getWholeFramePhaseStats(): Record<string, { totalMs: number }>;
          getWholeFrameStats(): { samples: number };
        };
      }).__voxelGame;
      return { stats: game?.getWholeFrameStats(), phases: game?.getWholeFramePhaseStats() };
    });
    expect(phases.stats?.samples).toBeGreaterThan(0);
    // Real frames do real world-update and render-submit work.
    expect(phases.phases?.worldUpdate?.totalMs).toBeGreaterThan(0);
    expect(phases.phases?.renderSubmit?.totalMs).toBeGreaterThan(0);

    // Disabling returns to interval-only sampling without errors.
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: { setWholeFramePhaseTimingEnabled(e: boolean): void } }).__voxelGame?.setWholeFramePhaseTimingEnabled(false);
    });
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('World-internal phases, aux snapshots, worker telemetry and work counts flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);
    // Browser-side accessors (inlined per evaluate: closures do not cross
    // the Playwright serialization boundary).
    const ENABLE = `(() => {
      const game = window.__voxelGame;
      game?.setWholeFramePhaseTimingEnabled(true);
      game?.player?.position?.set(168, 40, 8);
    })()`;
    await page.evaluate(ENABLE);
    await page.waitForTimeout(10000);

    const observed = await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          getWholeFramePhaseStats(): Record<string, { totalMs: number }>;
          getWholeFrameAuxLatest(): Record<string, number>;
          getWorkerTelemetry(): Record<string, number | boolean>;
          getWorldFrameWorkCounts(): Record<string, number>;
        };
      }).__voxelGame;
      return {
        phases: game?.getWholeFramePhaseStats(),
        aux: game?.getWholeFrameAuxLatest(),
        worker: game?.getWorkerTelemetry(),
        counts: game?.getWorldFrameWorkCounts(),
      };
    });

    // World-internal phases exist and fresh traversal attributes generation.
    for (const phase of ['generation', 'meshingMain', 'workerDispatch', 'lighting', 'upload', 'unload']) {
      expect(observed.phases?.[phase]?.totalMs).toEqual(expect.any(Number));
    }
    expect(observed.phases?.generation?.totalMs).toBeGreaterThan(0);

    // Renderer aux snapshot joins the whole-frame stream with a real buffer.
    for (const key of ['calls', 'triangles', 'geometries', 'textures', 'bufferWidth', 'bufferHeight', 'dynamicScale']) {
      expect(observed.aux?.[key]).toEqual(expect.any(Number));
    }
    expect(observed.aux?.bufferWidth).toBeGreaterThan(0);
    expect(observed.aux?.bufferHeight).toBeGreaterThan(0);

    // Worker telemetry and per-frame work-count shapes flow.
    expect(observed.worker?.enabled).toEqual(expect.any(Boolean));
    for (const key of ['pending', 'inFlight', 'completed', 'failures', 'retries', 'fallbacks']) {
      expect(observed.worker?.[key]).toEqual(expect.any(Number));
    }
    for (const key of [
      'generatedChunks',
      'syncMeshedJobs',
      'workerDispatchedJobs',
      'workerCompletedJobs',
      'lightOpsUsed',
      'uploadedMeshes',
      'unloadedChunks',
    ]) {
      expect(observed.counts?.[key]).toEqual(expect.any(Number));
    }

    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: { setWholeFramePhaseTimingEnabled(e: boolean): void } }).__voxelGame?.setWholeFramePhaseTimingEnabled(false);
    });
    expect(errors).toEqual([]);
  });
});
